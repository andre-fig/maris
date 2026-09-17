#!/usr/bin/env bash

set -euo pipefail

api_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repository_dir="$(cd "${api_dir}/../.." && pwd)"
source_root="${repository_dir}/data/ENC_ROOT"
storage_dir="${CHART_STORAGE_DIR:-${repository_dir}/.storage/chart-data}"
version="${1:-${TILESET_VERSION:-}}"
work_dir="$(mktemp -d)"
geopackage="${work_dir}/soundings.gpkg"
output_file="${work_dir}/miami-soundg.json"

if [[ -z "${version}" ]]; then
  echo "Usage: $0 <immutable-version>" >&2
  exit 1
fi

cleanup() {
  rm -rf "${work_dir}"
}

trap cleanup EXIT

first_cell=true
for cell in "${source_root}"/US5MIA*/US5MIA*.000; do
  cell_name="$(basename "${cell}" .000)"
  sql="SELECT *, '${cell_name}' AS SOURCE_CELL FROM SOUNDG"

  if [[ "${first_cell}" == true ]]; then
    ogr2ogr -f GPKG "${geopackage}" "${cell}" \
      -oo SPLIT_MULTIPOINT=ON -oo ADD_SOUNDG_DEPTH=ON -oo UPDATES=APPLY \
      -dialect SQLite -sql "${sql}" -nln soundings -dim XY
    first_cell=false
  else
    ogr2ogr -update -append "${geopackage}" "${cell}" \
      -oo SPLIT_MULTIPOINT=ON -oo ADD_SOUNDG_DEPTH=ON -oo UPDATES=APPLY \
      -dialect SQLite -sql "${sql}" -nln soundings -dim XY
  fi
done

ogr2ogr -f GeoJSON "${output_file}" "${geopackage}" soundings \
  -dim XY \
  -select DEPTH,RCID,LNAM,SORDAT,SORIND,SOURCE_CELL \
  -lco RFC7946=YES \
  -lco COORDINATE_PRECISION=6

pnpm --dir "${api_dir}" exec tsx scripts/build-soundg-tiles.ts \
  --input "${output_file}" \
  --storage-dir "${storage_dir}" \
  --version "${version}" \
  --publish
