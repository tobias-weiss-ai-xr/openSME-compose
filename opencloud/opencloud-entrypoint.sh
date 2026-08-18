#!/bin/sh
# OpenCloud entrypoint — generate config in a writable location.
# /etc/opencloud volume may be root-owned; use --config-path to write elsewhere.
set -e

OC_CONFIG_DIR="/var/lib/opencloud/config"
mkdir -p "$OC_CONFIG_DIR"

if [ ! -f "$OC_CONFIG_DIR/opencloud.yaml" ]; then
  echo "opencloud-entrypoint: no config found, running init..."
  opencloud init -f --insecure=true --config-path "$OC_CONFIG_DIR"
  echo "opencloud-entrypoint: config generated at $OC_CONFIG_DIR/opencloud.yaml"
fi

exec opencloud server --config-path "$OC_CONFIG_DIR"
