#!/bin/sh
# OpenCloud entrypoint — generates config on first run if missing.
set -e

CONFIG_PATH="/etc/opencloud/opencloud.yaml"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "opencloud-entrypoint: no config found at $CONFIG_PATH, running init..."
  opencloud init -f --insecure=true
  echo "opencloud-entrypoint: config generated."
fi

exec opencloud "$@"
