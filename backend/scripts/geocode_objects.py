#!/usr/bin/env python3
"""
Geocode all objects using Yandex Geocoder API.
Run inside the backend container:
  docker compose -f docker-compose.server.yml exec backend python scripts/geocode_objects.py

Yandex free tier: 1000 requests/day.
No rate limit enforced by ToS (but we add 0.2s delay to be safe).
"""
import os
import sys
import time
import urllib.request
import urllib.parse
import json
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL", "")
DB_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

YANDEX_API_KEY = os.environ.get("YANDEX_GEOCODER_KEY", "33e1d16c-27fe-4e9b-98e9-d7b66fc8bba1")
YANDEX_URL = "https://geocode-maps.yandex.ru/1.x/"
REGION_SUFFIX = "Калининградская область"
DELAY = 0.2  # seconds between requests


def yandex_geocode(address: str, attempt: int = 1):
    """Returns (lat, lng) or None. NOTE: Yandex returns lon lat order."""
    query = urllib.parse.urlencode({
        "apikey": YANDEX_API_KEY,
        "geocode": f"{address}, {REGION_SUFFIX}",
        "format": "json",
        "results": 1,
        "lang": "ru_RU",
    })
    url = f"{YANDEX_URL}?{query}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SecureTO/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        members = (
            data.get("response", {})
                .get("GeoObjectCollection", {})
                .get("featureMember", [])
        )
        if not members:
            return None
        pos = members[0]["GeoObject"]["Point"]["pos"]  # "lon lat"
        lon_str, lat_str = pos.split()
        return float(lat_str), float(lon_str)
    except Exception as e:
        if attempt < 3:
            time.sleep(2)
            return yandex_geocode(address, attempt + 1)
        print(f"    ERROR: {e}")
        return None


def main():
    if not DB_URL:
        print("DATABASE_URL not set. Run inside the backend container.")
        sys.exit(1)

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, name, address
        FROM objects
        WHERE geocode_status IS DISTINCT FROM 'exact'
          AND geocode_status IS DISTINCT FROM 'manual'
        ORDER BY name
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} objects to geocode via Yandex\n")

    ok = 0
    fail = 0

    for i, (obj_id, name, address) in enumerate(rows, 1):
        print(f"[{i}/{len(rows)}] {name[:55]}")
        print(f"  {address}")

        coords = yandex_geocode(address)
        time.sleep(DELAY)

        if coords:
            lat, lng = coords
            cur.execute("""
                UPDATE objects
                SET lat = %s, lng = %s,
                    geocode_status = 'exact',
                    geocode_source = 'yandex'
                WHERE id = %s
            """, (lat, lng, obj_id))
            conn.commit()
            print(f"  OK: {lat:.5f}, {lng:.5f}")
            ok += 1
        else:
            cur.execute("""
                UPDATE objects
                SET geocode_status = 'failed',
                    geocode_source = 'yandex'
                WHERE id = %s
            """, (obj_id,))
            conn.commit()
            print(f"  FAILED")
            fail += 1

    cur.close()
    conn.close()
    print(f"\nDone: {ok} geocoded, {fail} failed")
    if fail > 0:
        print("Re-run script to retry failed objects (they will be re-attempted).")


if __name__ == "__main__":
    main()
