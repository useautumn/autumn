# Tinybird Local for QA envs that opt in (qa_create tinybird: true), pinned to a digest.
# The upstream image is ~9 GB of stacked layers; flattened it is ~3.6 GB, re-split into layers under
# 1 GB because Cloudflare's registry times out finalising larger ones.
FROM tinybirdco/tinybird-local@sha256:99d28663eed712779fe60338d7730b9fee9bff92f84c5e44903784b61002602a AS src
RUN set -e; for i in 0 1 2 3 4 5 6; do mkdir -p /split/$i; done; cd /; \
	for d in $(ls -A / | grep -vxE 'proc|sys|dev|split|usr'); do cp -a --parents "$d" /split/0/; done; \
	cp -a --parents usr/bin /split/1/; \
	for d in $(ls -A /usr | grep -vxE 'bin|local'); do cp -a --parents "usr/$d" /split/6/; done; \
	for d in $(ls -A /usr/local | grep -vx lib); do cp -a --parents "usr/local/$d" /split/2/; done; \
	for d in $(ls -A /usr/local/lib | grep -vx python3.13); do cp -a --parents "usr/local/lib/$d" /split/2/; done; \
	for d in $(ls -A /usr/local/lib/python3.13 | grep -vx dist-packages); do cp -a --parents "usr/local/lib/python3.13/$d" /split/2/; done; \
	for d in $(ls -A /usr/local/lib/python3.13/dist-packages); do \
		n=$(( 3 + $(printf '%s' "$d" | cksum | cut -d' ' -f1) % 3 )); \
		cp -a --parents "usr/local/lib/python3.13/dist-packages/$d" /split/$n/; \
	done

FROM scratch
COPY --from=src /split/0/ /
COPY --from=src /split/1/ /
COPY --from=src /split/2/ /
COPY --from=src /split/3/ /
COPY --from=src /split/4/ /
COPY --from=src /split/5/ /
COPY --from=src /split/6/ /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
	CLICKHOUSE_VERSION=25.3.7.194 \
	CLICKHOUSE_CLUSTER_HOST=localhost \
	CLICKHOUSE_CLUSTER_HTTP_PORT=8123 \
	CLICKHOUSE_CLUSTER_INTERNAL_HOST=localhost \
	CLICKHOUSE_CLUSTER_INTERNAL_HTTP_PORT=8123 \
	CLICKHOUSE_INTERNAL_PORT=8123 \
	USE_GATHERER=False \
	OBJECT_STORAGE_ROOT_USER=admin \
	OBJECT_STORAGE_ROOT_PASSWORD=password
COPY start.sh /start.sh
WORKDIR /app
EXPOSE 7181 7182
CMD ["/bin/sh", "/start.sh"]
