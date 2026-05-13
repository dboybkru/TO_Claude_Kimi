#!/usr/bin/env python3
"""Geocode objects via Yandex with precision-aware fallback chain.

Логика для каждого объекта:
  1) Полный адрес с kind=house             → если kind=house → status=exact
  2) Полный адрес (без ограничения kind)   → если kind=street→ status=exact
  3) Нас. пункт (region поле в БД) с kind=locality → status=approximate
  4) Район (распарсенный из адреса)         → status=approximate
  5) Если ничего не в bbox Калининградской области → status=failed

Использование (внутри backend-контейнера):
  python scripts/geocode_objects_v2.py --dry-run --limit 20      # тест
  python scripts/geocode_objects_v2.py --dry-run                 # все, без записи
  python scripts/geocode_objects_v2.py --apply                   # записать в БД
  python scripts/geocode_objects_v2.py --apply --only-failed     # перегеокодировать только проблемные
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from typing import Optional

import psycopg2

YANDEX_KEY = os.environ.get("YANDEX_GEOCODER_KEY", "33e1d16c-27fe-4e9b-98e9-d7b66fc8bba1")
REGION_SUFFIX = "Калининградская область"
YANDEX_URL = "https://geocode-maps.yandex.ru/1.x/"
DELAY = 0.2  # seconds between requests

# Bounding box Калининградской области (приблизительно)
BBOX = (54.27, 19.50, 55.32, 22.95)  # lat_min, lng_min, lat_max, lng_max


def yandex(query: str, kind: Optional[str] = None) -> Optional[dict]:
    params = {
        "apikey": YANDEX_KEY,
        "geocode": query,
        "format": "json",
        "results": 1,
        "lang": "ru_RU",
    }
    if kind:
        params["kind"] = kind
    url = YANDEX_URL + "?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SecureTO/2.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}

    members = (
        data.get("response", {})
        .get("GeoObjectCollection", {})
        .get("featureMember", [])
    )
    if not members:
        return None
    g = members[0]["GeoObject"]
    try:
        lon, lat = map(float, g["Point"]["pos"].split())
        meta = g["metaDataProperty"]["GeocoderMetaData"]
        return {
            "lat": lat,
            "lng": lon,
            "precision": meta.get("precision"),
            "kind": meta.get("kind"),
            "text": meta.get("text", ""),
        }
    except Exception:
        return None


def in_bbox(lat: float, lng: float) -> bool:
    return BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lng <= BBOX[3]


# Регулярка для района/округа в адресе
_DISTRICT_RE = re.compile(
    r"([А-ЯЁа-яё][А-ЯЁа-яё\-]+(?:ский|ская|цкий|цкая|нский|нская))\s*"
    r"(?:муниципальный\s+округ|муниципальный\s+район|городской\s+округ|МО|ГО|округ|район|р-н)",
    re.IGNORECASE,
)


def extract_district(address: str) -> Optional[str]:
    m = _DISTRICT_RE.search(address or "")
    if not m:
        return None
    return m.group(0)


def normalize_locality(region: str) -> str:
    """`region` поле в БД часто такое: "п. Берёзовка", "г. Калининград"."""
    r = (region or "").strip()
    if not r or r.lower() == "не указано":
        return ""
    return r


def geocode_object(address: str, region: Optional[str]) -> dict:
    """Returns dict: {status, lat, lng, kind, text, attempt} or {status='failed', reason}."""
    locality = normalize_locality(region or "")
    district = extract_district(address or "")

    attempts = []

    # 1) full address, prefer house kind
    full = f"{address}, {REGION_SUFFIX}"
    r1 = yandex(full, kind="house")
    if r1 and "error" not in r1:
        attempts.append(("full+kind=house", r1))
        if r1.get("kind") == "house" and in_bbox(r1["lat"], r1["lng"]):
            return {"status": "exact", **r1, "_via": "house"}

    time.sleep(DELAY)

    # 2) full address without kind filter — accept house OR street
    r2 = yandex(full)
    if r2 and "error" not in r2:
        attempts.append(("full+no-kind", r2))
        if r2.get("kind") in ("house", "street") and in_bbox(r2["lat"], r2["lng"]):
            return {"status": "exact", **r2, "_via": r2.get("kind")}

    time.sleep(DELAY)

    # 3) locality (нас. пункт) with district context
    if locality:
        loc_q = f"{district + ', ' if district else ''}{locality}, {REGION_SUFFIX}"
        r3 = yandex(loc_q, kind="locality")
        if r3 and "error" not in r3:
            attempts.append(("locality+district", r3))
            if r3.get("kind") == "locality" and in_bbox(r3["lat"], r3["lng"]):
                return {"status": "approximate", **r3, "_via": "locality"}
        time.sleep(DELAY)

    # 4) locality without district hint
    if locality:
        r4 = yandex(f"{locality}, {REGION_SUFFIX}", kind="locality")
        if r4 and "error" not in r4:
            attempts.append(("locality-only", r4))
            if r4.get("kind") == "locality" and in_bbox(r4["lat"], r4["lng"]):
                return {"status": "approximate", **r4, "_via": "locality-no-district"}
        time.sleep(DELAY)

    # 5) district only
    if district:
        r5 = yandex(f"{district}, {REGION_SUFFIX}", kind="district")
        if r5 and "error" not in r5:
            attempts.append(("district", r5))
            if in_bbox(r5["lat"], r5["lng"]):
                return {"status": "approximate", **r5, "_via": "district"}
        time.sleep(DELAY)

    # 6) последняя попытка — что нашёл yandex по полному адресу без kind, если в bbox
    if r2 and "error" not in r2 and r2.get("lat") and in_bbox(r2["lat"], r2["lng"]):
        return {"status": "approximate", **r2, "_via": "fallback-full"}

    return {"status": "failed", "lat": None, "lng": None,
            "precision": None, "kind": None, "text": None,
            "_attempts": attempts, "_via": "none"}


def main():
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true", help="show what would be done")
    g.add_argument("--apply",   action="store_true", help="write to database")
    parser.add_argument("--limit", type=int, default=None, help="process at most N objects")
    parser.add_argument("--only-failed", action="store_true", help="re-process only failed/approximate")
    parser.add_argument("--all", action="store_true", help="re-process every object (including 'exact')")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("DATABASE_URL not set. Run inside the backend container.", file=sys.stderr)
        sys.exit(1)
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    where = "geocode_status IS DISTINCT FROM 'manual'"
    if args.only_failed:
        where = "geocode_status IN ('failed', 'approximate')"
    if args.all:
        where = "TRUE"

    sql = f"""
        SELECT id, name, address, region, lat, lng, geocode_status
        FROM objects
        WHERE {where}
        ORDER BY region NULLS LAST, address
    """
    if args.limit:
        sql += f" LIMIT {args.limit}"
    cur.execute(sql)
    rows = cur.fetchall()

    print(f"Selected {len(rows)} objects ({'DRY-RUN' if args.dry_run else 'APPLY'})\n")

    stats = {"exact": 0, "approximate": 0, "failed": 0, "unchanged": 0}
    transitions = []

    for i, (obj_id, name, address, region, lat_old, lng_old, old_status) in enumerate(rows, 1):
        print(f"[{i}/{len(rows)}] {name[:50]:50} | region={region!s:25} | status={old_status}")
        print(f"   addr: {address}")

        result = geocode_object(address, region)
        status = result["status"]
        stats[status] += 1

        if status == "failed":
            print(f"   ⛔ FAILED (no geocode result in bbox)")
            if args.apply:
                cur.execute(
                    "UPDATE objects SET geocode_status='failed', geocode_source='yandex_v2' WHERE id=%s",
                    (obj_id,),
                )
        else:
            via = result.get("_via", "?")
            kind = result.get("kind", "?")
            print(f"   ✓ {status:11} via={via:8} kind={kind:8} → {result['lat']:.5f}, {result['lng']:.5f}")
            print(f"     text: {result.get('text', '')[:80]}")
            if args.apply:
                cur.execute(
                    "UPDATE objects SET lat=%s, lng=%s, geocode_status=%s, geocode_source='yandex_v2' WHERE id=%s",
                    (result["lat"], result["lng"], status, obj_id),
                )

        if old_status != status:
            transitions.append((old_status, status))

        if args.apply:
            conn.commit()
        print()

    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print("STATS")
    print("=" * 60)
    for k, v in stats.items():
        print(f"  {k:12} : {v}")
    print()
    print("TRANSITIONS (old → new)")
    from collections import Counter
    t_counter = Counter(transitions)
    for (a, b), c in t_counter.most_common():
        print(f"  {a!s:15} → {b!s:15} : {c}")


if __name__ == "__main__":
    main()
