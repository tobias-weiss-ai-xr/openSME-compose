#!/bin/sh
# OpenCloud entrypoint — generate config on first run.
# /etc/opencloud may be root-owned, so we init into a temp dir then copy.
set -e

if [ ! -f /etc/opencloud/opencloud.yaml ]; then
  TMPDIR=$(mktemp -d)
  echo "opencloud-entrypoint: no config found, running init..."
  opencloud init -f --insecure=true --config-path "$TMPDIR"
  cp "$TMPDIR/opencloud.yaml" /etc/opencloud/opencloud.yaml
  rm -rf "$TMPDIR"
  echo "opencloud-entrypoint: config generated."
fi

exec opencloud server