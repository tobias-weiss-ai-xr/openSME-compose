# SPDX-License-Identifier: Apache-2.0
# dev-agent — Reactive container health monitor (Docker, not K8s)
#
# Watches Docker containers via the Docker socket, detects unhealthy ones,
# sends context to an LLM for root-cause analysis.
#
# Build:
#   nix-build monitoring/nix/dev-agent.nix -o result-dev-agent
#   docker load < result-dev-agent
#   docker tag dev-agent:latest-nix ghcr.io/tobias-weiss-ai-xr/dev-agent:latest
#
# Unlike the K8s version (opensme-nix/nix/images/dev-agent.nix), this version
# uses `docker ps` / `docker inspect` / `docker stats` instead of `kubectl`.

{ pkgs ? import <nixpkgs> { system = "x86_64-linux"; } }:

let
  # The Docker-based collector/monitor Python script
  devAgentPy = pkgs.writeText "dev_agent.py" (builtins.readFile ./dev-agent-files/dev_agent.py);
  entrypointSh = pkgs.writeText "entrypoint.sh" (builtins.readFile ./dev-agent-files/entrypoint.sh);
  healthcheckSh = pkgs.writeText "healthcheck.sh" (builtins.readFile ./dev-agent-files/healthcheck.sh);

  devAgentDir = pkgs.runCommand "dev-agent-files" {} ''
    mkdir -p $out/opt/dev-agent $out/home/opensme
    cp ${devAgentPy} $out/opt/dev-agent/dev_agent.py
    cp ${entrypointSh} $out/opt/dev-agent/entrypoint.sh
    chmod +x $out/opt/dev-agent/entrypoint.sh
    cp ${healthcheckSh} $out/opt/dev-agent/healthcheck.sh
    chmod +x $out/opt/dev-agent/healthcheck.sh
  '';

  # Real /etc/passwd and /etc/group (buildLayeredImage doesn't include fakeNss targets)
  etcFiles = pkgs.runCommand "dev-agent-etc" {} ''
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
  name = "dev-agent";
  tag = "latest-nix";

  contents = with pkgs; [
    python3
    curl
    bash
    coreutils
    gnugrep
    gnused
    procps
    cacert
    docker
    devAgentDir
    etcFiles
  ];

  config = {
    User = "0:0";
    WorkingDir = "/home/opensme";
    Entrypoint = [
      "${pkgs.bash}/bin/bash"
      "/opt/dev-agent/entrypoint.sh"
    ];
    Cmd = [];
    Env = [
      "OPERATOR_NAME=opensme-dev-agent"
      "OPERATOR_NAMESPACE=opensme"
      "OPERATOR_VERSION=3.1.0-docker"
      "OPERATOR_LOG_LEVEL=info"
      "OPERATOR_WATCH_NAMESPACES=opensme,default"
      "OLLAMA_URL=http://ollama:11434"
      "OLLAMA_MODEL=qwen3-30b-a3b:latest"
      "RECONCILE_INTERVAL=60"
      "ANALYSIS_TTL=300"
      "ANALYSIS_TTL_MAX=1200"
      "MAX_PODS_PER_CYCLE=3"
      "OPERATOR_METRICS_BIND_ADDRESS=0.0.0.0:8080"
      "OPERATOR_HEALTH_PROBE_BIND_ADDRESS=0.0.0.0:8081"
      "HISTORY_FILE=/var/lib/opensme/analysis-history.json"
      "HISTORY_MAX=100"
      "PATH=${pkgs.python3}/bin:${pkgs.curl}/bin:${pkgs.bash}/bin:${pkgs.coreutils}/bin:${pkgs.gnugrep}/bin:${pkgs.gnused}/bin:${pkgs.procps}/bin:${pkgs.docker}/bin"
      "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
      "HOME=/home/opensme"
    ];
    ExposedPorts = {
      "8080/tcp" = {};
      "8081/tcp" = {};
    };
  };

  maxLayers = 50;
}
