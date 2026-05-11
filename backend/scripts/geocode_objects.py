#!/usr/bin/env python3
"""
Geocode all objects using Nominatim (OpenStreetMap).
Run inside the backend container:
  docker compose -f docker-compose.server.yml exec backend python scripts/geocode_objects.py

Rate limit: 1 req/sec per Nominatim ToS.
"""
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import json
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL", "")
# Convert asyncpg URL to psycopg2 format
DB_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "SecureTO-Geocoder/1.0 (daniil.gurov@gmail.com)"
REGION_SUFFIX = "Калининградская область, Россия"
DELAY = 1.1  # seconds between requests (Nominatim ToS: max 1/sec)


def clean_address(raw: str) -> str:
    """Normalize address for better Nominatim results."""
    addr = raw.strip()
    # Expand abbreviations
    replacements = [
        (r'\bг\.\s*', ''),          # г. Калининград → Калининград
        (r'\bп\.\s*', 'посёлок '),  # п. Совхозное → посёлок Совхозное
        (r'\bс\.\s*', 'село '),
        (r'\bд\.\s*', 'деревня '),
        (r'\bпос\.\s*', 'посёлок '),
        (r'\bул\.\s*', 'улица '),
        (r'\bпр-т\s*', 'проспект '),
        (r'\bпр\.\s*', 'проспект '),
        (r'\bпер\.\s*', 'переулок '),
        (r'\bш\.\s*', 'шоссе '),
        (r'\bпл\.\s*', 'площадь '),
        (r'\bб-р\s*', 'бульвар '),
        (r'\bнаб\.\s*', 'набережная '),
        (r'\bмкр\.\s*', 'микрорайон '),
        (r'д\.?\s*(\d)', r'\1'),    # д.5 → 5
    ]
    for pattern, repl in replacements:
        addr = re.sub(pattern, repl, addr, flags=re.IGNORECASE)
    return addr.strip(', ')


def nominatim_search(address: str, attempt: int = 1) -> tuple[float, float] | None:
    query = urllib.parse.urlencode({
        "q": f"{address}, {REGION_SUFFIX}",
        "format": "json",
        "limit": 1,
        "countrycodes": "ru",
        "addressdetails": 0,
    })
    url = f"{NOMINATIM_URL}?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        if attempt < 3:
            time.sleep(3)
            return nominatim_search(address, attempt + 1)
        print(f"    ERROR: {e}")
    return None


def main():
    if not DB_URL:
        print("DATABASE_URL not set. Run inside the backend container.")
        sys.exit(1)

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Get objects that don't have exact coords yet
    cur.execute("""
        SELECT id, name, address
        FROM objects
        WHERE geocode_status IS DISTINCT FROM 'exact'
          AND geocode_status IS DISTINCT FROM 'manual'
        ORDER BY name
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} objects to geocode\n")

    ok = 0
    fail = 0

    for i, (obj_id, name, address) in enumerate(rows, 1):
        cleaned = clean_address(address)
        print(f"[{i}/{len(rows)}] {name[:50]}")
        print(f"  Address: {cleaned}")

        coords = nominatim_search(cleaned)
        time.sleep(DELAY)

        if coords:
            lat, lng = coords
            cur.execute("""
                UPDATE objects
                SET lat = %s, lng = %s,
                    geocode_status = 'exact',
                    geocode_source = 'nominatim'
                WHERE id = %s
            """, (lat, lng, obj_id))
            conn.commit()
            print(f"  OK: {lat:.5f}, {lng:.5f}")
            ok += 1
        else:
            # Mark as failed so we skip on next run
            cur.execute("""
                UPDATE objects
                SET geocode_status = 'failed',
                    geocode_source = 'nominatim'
                WHERE id = %s
            """, (obj_id,))
            conn.commit()
            print(f"  FAILED — keeping approximate coords")
            fail += 1

    cur.close()
    conn.close()
    print(f"\nDone: {ok} geocoded, {fail} failed")


if __name__ == "__main__":
    main()
