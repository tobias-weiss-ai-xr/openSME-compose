# SPDX-License-Identifier: Apache-2.0
# taskfleet — Parallel LLM task orchestration (Nix Docker image)
#
# taskfleet v2 packages the TypeScript npm core (@earendil-works/taskfleet)
# alongside the legacy bash orchestrator. The container ENTRYPOINT is the npm
# `taskfleet` bin; native commands (--help/--status/--dry-run/--version) run in
# TypeScript, and --once currently bridges to /opt/taskfleet/orchestrator.sh
# until the native dispatch loop lands.
#
# Dependencies: bash, jq, git, curl, docker (for worktree builds), nodejs_22,
#               the pi coding agent (provided at runtime via PATH).
#
# Build:
#   nix build .#taskfleet && docker load < result-taskfleet
#   docker tag taskfleet:latest-nix ghcr.io/tobias-weiss-ai-xr/taskfleet:latest
#
# Usage:
#   docker compose --profile taskfleet run --rm taskfleet --once
#   docker compose --profile taskfleet run --rm taskfleet --status
#   docker compose --profile taskfleet run --rm taskfleet --version

{ pkgs ? import <nixpkgs> { system = "x86_64-linux"; } }:

let
  # --- Legacy bash orchestrator (bridge target for --once) -------------------
  taskfleetSrc = pkgs.runCommand "taskfleet-src" {} ''
    mkdir -p $out/opt/taskfleet
    cp ${./taskfleet-files}/orchestrator.sh $out/opt/taskfleet/orchestrator.sh
    chmod +x $out/opt/taskfleet/orchestrator.sh
    mkdir -p $out/opt/taskfleet/lib
    for f in ${./taskfleet-files}/lib/*.sh; do
      cp "$f" $out/opt/taskfleet/lib/
    done
    mkdir -p $out/opt/taskfleet/prompts
    for f in ${./taskfleet-files}/prompts/*.md; do
      cp "$f" $out/opt/taskfleet/prompts/ 2>/dev/null || true
    done
    mkdir -p $out/opt/taskfleet/config
    for f in ${./taskfleet-files}/config/*.json ${./taskfleet-files}/config/*.json.example; do
      cp "$f" $out/opt/taskfleet/config/ 2>/dev/null || true
    done
  '';

  # --- npm core (TypeScript, dist + prebuilt node_modules) -------------------
  taskfleetCore = pkgs.runCommand "taskfleet-core" {} ''
    mkdir -p $out/opt/taskfleet-core
    cp -r ${./taskfleet-files/core/dist} $out/opt/taskfleet-core/dist
    cp ${./taskfleet-files/core/package.json} $out/opt/taskfleet-core/package.json
    cp ${./taskfleet-files/core/package-lock.json} $out/opt/taskfleet-core/package-lock.json
    cp -r ${./taskfleet-files/core/node_modules} $out/opt/taskfleet-core/node_modules
  '';

  # --- bin: /usr/bin/taskfleet -> node dist/cli.js ----------------------------
  taskfleetBin = pkgs.runCommand "taskfleet-bin" {} ''
    mkdir -p $out/usr/bin
    cat > $out/usr/bin/taskfleet <<'EOF'
    #!/${pkgs.bash}/bin/bash
    set -euo pipefail
    echo "[INFO] === taskfleet v2 starting ==="
    echo "[INFO] TF_REPO_DIR: ''${TF_REPO_DIR:-/repo}"
    echo "[INFO] TF_STATE_DIR: ''${TF_STATE_DIR:-/var/lib/taskfleet}"
    mkdir -p "''${TF_STATE_DIR:-/var/lib/taskfleet}" "''${TF_LOG_DIR:-/var/lib/taskfleet/logs}"
    exec ${pkgs.nodejs_22}/bin/node /opt/taskfleet-core/dist/cli.js "$@"
    EOF
    chmod +x $out/usr/bin/taskfleet
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
    nodejs_22
    taskfleetSrc
    taskfleetCore
    taskfleetBin
    etcFiles
  ];

  config = {
    User = "0:0";
    WorkingDir = "/repo";
    Entrypoint = [ "/usr/bin/taskfleet" ];
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
