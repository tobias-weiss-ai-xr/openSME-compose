# SPDX-License-Identifier: Apache-2.0
# Nix flake for building monitoring Docker images.
#
# Build all images:
#   nix build .#dev-agent .#predictive-agent .#taskfleet
#
# Build and load into Docker:
#   nix build .#dev-agent && docker load < result
#   nix build .#predictive-agent && docker load < result
#   nix build .#taskfleet && docker load < result
#
# Then tag for your registry:
#   docker tag dev-agent:latest-nix ghcr.io/tobias-weiss-ai-xr/dev-agent:latest
#   docker tag predictive-agent:latest-nix ghcr.io/tobias-weiss-ai-xr/predictive-agent:latest
#   docker tag taskfleet:latest-nix ghcr.io/tobias-weiss-ai-xr/taskfleet:latest

{
  description = "openSME monitoring Docker images (Nix-built, reproducible)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages = {
          # Reactive container health monitor (Docker, not K8s)
          dev-agent = (import ./dev-agent.nix { inherit pkgs; });

          # Predictive container health monitor (Docker, not K8s)
          predictive-agent = (import ./predictive-agent.nix { inherit pkgs; });

          # Parallel LLM task orchestration
          taskfleet = (import ./taskfleet.nix { inherit pkgs; });
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nix
            docker
            jq
            git
            python3
            curl
          ];
        };
      });
}
