#!/bin/sh

set -eu

PUBLIC_PORT="${PORT:-3000}"
export PUBLIC_PORT
envsubst '${PUBLIC_PORT}' \
  < /etc/nginx/templates/maris.conf.template \
  > /etc/nginx/conf.d/default.conf

PORT=3001 node /app/apps/api/dist/main.js &
api_pid=$!

# Keep the container lifecycle tied to the API process. If Node exits (for
# example after an out-of-memory failure), leaving nginx alive would make
# Railway see a running container while every request returned 502.
nginx -g 'daemon off;' &
nginx_pid=$!

cleanup() {
  kill "$api_pid" "$nginx_pid" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

set +e
wait "$api_pid"
api_status=$?
set -e
exit "$api_status"
