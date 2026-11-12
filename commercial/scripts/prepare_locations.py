"""Prepare the local Mawadda location catalog from GeoNames UTF-8 exports."""

import gzip
import io
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile


def rows(path):
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if line.strip() and not line.startswith("#"):
                yield line.rstrip("\r\n").split("\t")


def main(source, target):
    countries = {row[0]: row[4] for row in rows(source / "countryInfo.txt") if row[0] != "AN"}
    regions = {row[0]: row[1] for row in rows(source / "admin1CodesASCII.txt")}
    arabic_script = re.compile(r"[\u0621-\u064a\u0671-\u06d3]")
    standard_arabic = re.compile(r"[\u0621-\u063a\u0641-\u0652\u0670 .()\-]+")
    cities = {code: [] for code in countries}

    with ZipFile(source / "cities500.zip") as archive, archive.open("cities500.txt") as raw:
        for line in io.TextIOWrapper(raw, encoding="utf-8"):
            row = line.rstrip("\r\n").split("\t")
            if row[6] != "P" or row[8] not in cities:
                continue
            city_id, name, ascii_name = row[:3]
            arabic_names = list(dict.fromkeys(alias for alias in row[3].split(",") if arabic_script.search(alias)))
            standard_names = [alias for alias in arabic_names if standard_arabic.fullmatch(alias)]
            label = name
            if arabic_names and not arabic_script.search(name):
                label = min(standard_names, key=lambda alias: alias.count("ى")) if standard_names else arabic_names[0]
            region = regions.get(f"{row[8]}.{row[10]}", "")
            aliases = list(dict.fromkeys(alias for alias in [name, ascii_name, *arabic_names[:8]] if alias and alias != label))
            cities[row[8]].append((int(row[14] or 0), int(city_id), label, region, aliases))

    catalog = {
        "countries": countries,
        "cities": {code: [row[1:] for row in sorted(items, key=lambda row: (-row[0], row[1]))] for code, items in cities.items()},
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(catalog, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    target.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    print(f"{len(countries)} countries and territories, {sum(map(len, cities.values()))} populated places")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
