# Base image for per-branch QA envs. Ref-agnostic: the app is cloned, installed and
# built into a per-env container snapshot by prepare.sh, so this image changes rarely.
FROM oven/bun:1.3.14-debian AS bun
FROM ghcr.io/faiscadev/fakecloud:0.45.0@sha256:78844f091be86081d3d11b056e3d56e6ea0ace4ce607e55fa4255fc759d39279 AS fakecloud

FROM apache/kafka-native:3.9.1 AS kafka

FROM oven/bun:1.3.14-debian AS deps
COPY deps/ /app/
RUN cd /app && bun install --frozen-lockfile --ignore-scripts --filter autumn --filter ./server --filter ./vite \
    --filter ./apps/balance-worker --filter ./scripts && rm -rf /root/.bun/install/cache \
 && cd /app/node_modules/.bun && for i in 0 1 2 3 4 5 6 7; do mkdir -p /split/$i; done \
 && ls -A | while read -r d; do mv "$d" /split/$(( $(printf '%s' "$d" | cksum | cut -d' ' -f1) % 8 ))/; done

FROM debian:trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git postgresql-client procps tini \
 && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
COPY --from=fakecloud /usr/local/bin/fakecloud /usr/local/bin/fakecloud
RUN curl -fsSL https://dragonflydb.gateway.scarf.sh/latest/dragonfly-x86_64.tar.gz | tar -xz -C /tmp \
 && install -m 0755 /tmp/dragonfly-x86_64 /usr/local/bin/dragonfly && rm -rf /tmp/dragonfly*
COPY --from=kafka /opt/kafka/kafka.Kafka /etc/kafka/docker/log4j.properties /etc/kafka/docker/tools-log4j.properties /opt/kafka/
# node_modules for the dev lockfile (only the workspaces the stack runs); prepare.sh applies a branch's diff.
# The store is copied in several layers: Cloudflare's registry times out finalising a single ~1 GB layer.
COPY --from=deps /app /app
COPY --from=deps /split/0/ /app/node_modules/.bun/
COPY --from=deps /split/1/ /app/node_modules/.bun/
COPY --from=deps /split/2/ /app/node_modules/.bun/
COPY --from=deps /split/3/ /app/node_modules/.bun/
COPY --from=deps /split/4/ /app/node_modules/.bun/
COPY --from=deps /split/5/ /app/node_modules/.bun/
COPY --from=deps /split/6/ /app/node_modules/.bun/
COPY --from=deps /split/7/ /app/node_modules/.bun/
COPY qa/ /qa/
RUN chmod +x /qa/*.sh
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--", "/qa/entrypoint.sh"]
