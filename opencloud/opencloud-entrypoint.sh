#!/bin/sh
# OpenCloud entrypoint — generate config on first run.
set -e

if [ ! -f /etc/opencloud/opencloud.yaml ]; then
  echo "opencloud-entrypoint: no config found, running init..." >&2
  opencloud init -f --insecure=true
  echo "opencloud-entrypoint: config generated." >&2
fi

exec opencloud server
