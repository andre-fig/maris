#!/bin/sh

set -eu

PUBLIC_PORT="${PORT:-3000}"
export PUBLIC_PORT
envsubst '${PUBLIC_PORT}' \
  < /etc/nginx/templates/maris.conf.template \
  > /etc/nginx/conf.d/default.conf

PORT=3001 node /app/apps/api/dist/main.js &
exec nginx -g 'daemon off;'
