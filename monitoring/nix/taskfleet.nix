# SPDX-License-Identifier: Apache-2.0
# taskfleet — Parallel LLM task orchestration (Nix Docker image)
#
# taskfleet dispatches development tasks to LLM workers running in isolated
# git worktrees. It is NOT a long-running daemon — invoke it on demand via
# `docker compose run --rm taskfleet --once`.
#
# Dependencies: bash, jq, git, curl, docker (for worktree builds), pi (coding agent)
#
# Build:
#   nix-build monitoring/nix/taskfleet.nix -o result-taskfleet
#   docker load < result-taskfleet
#   docker tag taskfleet:latest-nix ghcr.io/tobias-weiss-ai-xr/taskfleet:latest
#
# Usage:
#   docker compose --profile taskfleet run --rm taskfleet --once
#   docker compose --profile taskfleet run --rm taskfleet --status
#   docker compose --profile taskfleet run --rm taskfleet --task DA-06

{ pkgs ? import <nixpkgs> { system = "x86_64-linux"; } }:

let
  # Copy the entire taskfleet repo into the image
  taskfleetSrc = pkgs.runCommand "taskfleet-src" {} ''
    mkdir -p $out/opt/taskfleet
    # Copy orchestrator and lib
    cp ${./taskfleet-files}/orchestrator.sh $out/opt/taskfleet/orchestrator.sh
    chmod +x $out/opt/taskfleet/orchestrator.sh
    # Copy lib directory
    mkdir -p $out/opt/taskfleet/lib
    for f in ${./taskfleet-files}/lib/*.sh; do
      cp "$f" $out/opt/taskfleet/lib/
    done
    # Copy prompts
    mkdir -p $out/opt/taskfleet/prompts
    for f in ${./taskfleet-files}/prompts/*.md; do
      cp "$f" $out/opt/taskfleet/prompts/ 2>/dev/null || true
    done
    # Copy config templates
    mkdir -p $out/opt/taskfleet/config
    for f in ${./taskfleet-files}/config/*.json ${./taskfleet-files}/config/*.json.example; do
      cp "$f" $out/opt/taskfleet/config/ 2>/dev/null || true
    done
  '';

  entrypointSh = pkgs.writeText "entrypoint.sh" ''
    #!/usr/bin/env bash
    set -euo pipefail
    echo "[INFO] === taskfleet starting ==="
    echo "[INFO] TF_REPO_DIR: ''${TF_REPO_DIR:-/repo}"
    echo "[INFO] TF_MAX_PARALLEL: ''${TF_MAX_PARALLEL:-2}"
    echo "[INFO] TF_STATE_DIR: ''${TF_STATE_DIR:-/var/lib/taskfleet}"
    mkdir -p "''${TF_STATE_DIR:-/var/lib/taskfleet}" "''${TF_LOG_DIR:-/var/lib/taskfleet/logs}"
    exec /opt/taskfleet/orchestrator.sh "$@"
  '';

  etcFiles = pkgs.runCommand "taskfleet-etc" {} ''
    mkdir -p $out/etc
    echo 'root:x:0:0:root:/root:/bin/bash' > $out/etc/passwd
    echo 'opensme:x:1000:1000:opensme:/home/opensme:/bin/bash' >> $out/etc/passwd
    echo 'nobody:x:65534:65534:nobody:/:/sbin/nologin' >> $out/etc/passwd
    echo 'root:x:0:' > $out/etc/group
    echo 'opensme:x:1000:' >> $out/etc/group
    echo 'nobody:x:65534:' >> $out/etc/group
  '';

in
pkgs.dockerTools.buildLayeredImage {
  name = "taskfleet";
  tag = "latest-nix";

  contents = with pkgs; [
    bash
    jq
    git
    curl
    coreutils
    gnugrep
    gnused
    procps
    cacert
    docker
    # pi coding agent (npm package) — nodejs includes npm
    nodejs_22
    taskfleetSrc
    etcFiles
  ];

  # Create a wrapper script that installs pi globally
  # (pi is an npm package: @earendil-works/pi-coding-agent)

  config = {
    User = "0:0";
    WorkingDir = "/repo";
    Entrypoint = [
      "${pkgs.bash}/bin/bash"
      "${entrypointSh}"
    ];
    Cmd = [];
    Env = [
      "TF_REPO_DIR=/repo"
      "TF_MAX_PARALLEL=2"
      "TF_MAX_ROUNDS=0"
      "TF_AUTO_TIER=1"
      "TF_AFFINITY=2"
      "TF_ROUTING=1"
      "TF_LOCAL_ONLY=0"
      "TF_CONFIG_DIR=/config"
      "TF_STATE_DIR=/var/lib/taskfleet"
      "PATH=${pkgs.bash}/bin:${pkgs.jq}/bin:${pkgs.git}/bin:${pkgs.curl}/bin:${pkgs.coreutils}/bin:${pkgs.gnugrep}/bin:${pkgs.gnused}/bin:${pkgs.procps}/bin:${pkgs.docker}/bin:${pkgs.nodejs_22}/bin:/opt/taskfleet"
      "HOME=/home/opensme"
      "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
    ];
    ExposedPorts = {};
  };

  maxLayers = 50;
}
