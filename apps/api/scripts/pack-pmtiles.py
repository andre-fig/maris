"""Pack a sequential tile spool into PMTiles; never create individual tile files."""
import gzip
import json
import struct
import sys

from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import write

spool, destination, manifest_path = sys.argv[1:]
with open(manifest_path, encoding="utf-8") as source:
    manifest = json.load(source)
west, south, east, north = manifest["bounds"]
with write(destination) as writer, open(spool, "rb") as source:
    while True:
        header = source.read(16)
        if not header:
            break
        if len(header) != 16:
            raise ValueError("Truncated tile spool header")
        z, x, y, length = struct.unpack("<IIII", header)
        tile = source.read(length)
        if len(tile) != length:
            raise ValueError("Truncated tile spool data")
        writer.write_tile(zxy_to_tileid(z, x, y), gzip.compress(tile, compresslevel=6, mtime=0))
    writer.finalize({
        "tile_type": TileType.MVT,
        "tile_compression": Compression.GZIP,
        "min_lon_e7": round(west * 1e7), "min_lat_e7": round(south * 1e7),
        "max_lon_e7": round(east * 1e7), "max_lat_e7": round(north * 1e7),
        "center_zoom": manifest["minzoom"],
        "center_lon_e7": round((west + east) * 0.5e7),
        "center_lat_e7": round((south + north) * 0.5e7),
    }, {"name": manifest["name"], "format": "pbf", "vector_layers": manifest["vectorLayers"]})
