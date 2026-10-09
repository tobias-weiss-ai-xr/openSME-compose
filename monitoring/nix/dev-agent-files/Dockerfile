# openSME Dev Agent — reactive container health monitor (pure stdlib Python)
# Minimal image: the operator itself needs no third-party dependencies.
# Runs as root because it must READ the (read-only mounted) Docker socket —
# mitigated by the compose overlay: :ro mount, init:true, no-new-privileges.
FROM python:3.13-slim

ARG DOCKER_VERSION=29.9.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz \
    | tar -xz -C /tmp \
 && mv /tmp/docker/docker /usr/local/bin/docker \
 && rm -rf /tmp/docker

WORKDIR /opt/dev-agent
COPY dev_agent.py entrypoint.sh healthcheck.sh /opt/dev-agent/
RUN chmod +x /opt/dev-agent/entrypoint.sh /opt/dev-agent/healthcheck.sh \
 && mkdir -p /var/lib/opensme /var/log/opensme /var/cache/opensme /run/opensme /home/opensme

# Runtime state lives in the named volume mounted at /var/lib/opensme
VOLUME /var/lib/opensme

EXPOSE 8080 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["/opt/dev-agent/healthcheck.sh", "liveness"]
ENTRYPOINT ["/opt/dev-agent/entrypoint.sh"]
