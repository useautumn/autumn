#!/bin/sh
# Cloudflare's VM hides /dev/shm (Python's semaphores need it), names the host with a label longer
# than DNS allows (Tinybird's server can't encode it) and caps open files at 1024; Docker does none of these.
exec >>/var/log/qa-start.log 2>&1
mkdir -p /dev/shm
mount -t tmpfs -o size=1g,mode=1777 shm /dev/shm || chmod 1777 /dev/shm
hostname tinybird-local
prlimit --pid $$ --nofile=65536:65536
echo "open files: $(ulimit -n) (hard $(ulimit -H -n))"
# supervisord would otherwise start its services with whatever limit it inherits.
if [ "$(ulimit -n)" -ge 65536 ] && ! grep -q '^minfds' /etc/supervisor/conf.d/supervisord.conf; then
	sed -i 's/^\[supervisord\]$/[supervisord]\nminfds=65536/' /etc/supervisor/conf.d/supervisord.conf
fi
exec /usr/bin/supervisord
