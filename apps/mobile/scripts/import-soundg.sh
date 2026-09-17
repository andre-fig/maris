#!/usr/bin/env bash

set -euo pipefail

mobile_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repository_dir="$(cd "${mobile_dir}/../.." && pwd)"
source_root="${repository_dir}/data/ENC_ROOT"
output_dir="${mobile_dir}/assets/data"
output_file="${output_dir}/miami-soundg.json"
work_dir="$(mktemp -d)"
geopackage="${work_dir}/soundings.gpkg"
generated_file="${work_dir}/miami-soundg.json"

cleanup() {
  rm -rf "${work_dir}"
}

trap cleanup EXIT
mkdir -p "${output_dir}"

first_cell=true
for cell in "${source_root}"/US5MIA*/US5MIA*.000; do
  cell_name="$(basename "${cell}" .000)"
  sql="SELECT *, '${cell_name}' AS SOURCE_CELL FROM SOUNDG"

  if [[ "${first_cell}" == true ]]; then
    ogr2ogr \
      -f GPKG "${geopackage}" "${cell}" \
      -oo SPLIT_MULTIPOINT=ON \
      -oo ADD_SOUNDG_DEPTH=ON \
      -oo UPDATES=APPLY \
      -dialect SQLite \
      -sql "${sql}" \
      -nln soundings \
      -dim XY
    first_cell=false
  else
    ogr2ogr \
      -update -append "${geopackage}" "${cell}" \
      -oo SPLIT_MULTIPOINT=ON \
      -oo ADD_SOUNDG_DEPTH=ON \
      -oo UPDATES=APPLY \
      -dialect SQLite \
      -sql "${sql}" \
      -nln soundings \
      -dim XY
  fi
done

ogr2ogr \
  -f GeoJSON "${generated_file}" "${geopackage}" soundings \
  -dim XY \
  -select DEPTH,RCID,LNAM,SORDAT,SORIND,SOURCE_CELL \
  -lco RFC7946=YES \
  -lco COORDINATE_PRECISION=6

mv "${generated_file}" "${output_file}"
ogrinfo -ro -so "${output_file}" soundings
