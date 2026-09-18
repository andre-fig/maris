#!/usr/bin/env python3
"""Convert a NOAA/NOMADS GRIB2 subset into a compact JSON grid."""

import json
import math
import sys

from eccodes import (
    codes_get,
    codes_get_array,
    codes_grib_new_from_file,
    codes_release,
)


FIELD_MAP = {
    ("UGRD", "heightAboveGround", 10): "windU",
    ("VGRD", "heightAboveGround", 10): "windV",
    ("TMP", "heightAboveGround", 2): "temperature",
    ("APCP", "surface", 0): "precipitation",
    ("TCDC", "entireAtmosphere", 0): "cloudCover",
    ("PRMSL", "meanSea", 0): "pressure",
    ("GUST", "surface", 0): "gust",
    ("RH", "heightAboveGround", 2): "humidity",
}

SHORT_NAME_MAP = {
    "10u": "windU",
    "10v": "windV",
    "2t": "temperature",
    "2r": "humidity",
    "tp": "precipitation",
    "apcp": "precipitation",
    "prate": "precipitationRate",
    "tcc": "cloudCover",
    "prmsl": "pressure",
    "gust": "gust",
}


def get(handle, key, default=None):
    try:
        return codes_get(handle, key)
    except Exception:
        return default


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: gfs-grib-parser.py FILE")

    fields = {}
    metadata = None
    with open(sys.argv[1], "rb") as stream:
        while True:
            handle = codes_grib_new_from_file(stream)
            if handle is None:
                break
            try:
                short_name = get(handle, "shortName")
                level_type = get(handle, "typeOfLevel")
                level = get(handle, "level")
                key = (short_name, level_type, int(level or 0))
                output_name = FIELD_MAP.get(key) or SHORT_NAME_MAP.get(short_name)

                if metadata is None:
                    values = codes_get_array(handle, "values")
                    metadata = {
                        "width": int(get(handle, "Ni")),
                        "height": int(get(handle, "Nj")),
                        "firstLatitude": float(get(handle, "latitudeOfFirstGridPointInDegrees")),
                        "lastLatitude": float(get(handle, "latitudeOfLastGridPointInDegrees")),
                        "firstLongitude": float(get(handle, "longitudeOfFirstGridPointInDegrees")),
                        "lastLongitude": float(get(handle, "longitudeOfLastGridPointInDegrees")),
                        "iScansNegatively": bool(get(handle, "iScansNegatively", 0)),
                        "jScansPositively": bool(get(handle, "jScansPositively", 0)),
                        "dataDate": int(get(handle, "dataDate")),
                        "dataTime": int(get(handle, "dataTime")),
                        "forecastTime": int(get(handle, "forecastTime", 0)),
                    }

                if output_name:
                    values = codes_get_array(handle, "values")
                    fields[output_name] = [
                        None if not math.isfinite(float(value)) else float(value)
                        for value in values
                    ]
            finally:
                codes_release(handle)

    if metadata is None or not fields:
        raise ValueError("GRIB2 contains no expected fields")

    print(json.dumps({"metadata": metadata, "fields": fields}, separators=(",", ":")))


if __name__ == "__main__":
    main()
