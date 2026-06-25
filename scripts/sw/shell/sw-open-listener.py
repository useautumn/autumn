#!/usr/bin/env python3
"""sw URL-open listener (runs on the Mac). Binds a unix socket and opens any URL
written to it in the default browser — so a CLI on the devbox can pop your local
browser over the ssh reverse-forward. Socket path is argv[1]."""
import os
import socket
import subprocess
import sys

sock_path = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    "~/.config/atmn-sw/open.sock"
)
os.makedirs(os.path.dirname(sock_path), exist_ok=True)
try:
    os.unlink(sock_path)
except FileNotFoundError:
    pass

server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
server.bind(sock_path)
server.listen(16)

while True:
    try:
        conn, _ = server.accept()
    except Exception:
        continue
    data = b""
    try:
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                break
            data += chunk
    except Exception:
        pass
    finally:
        conn.close()
    for line in data.decode("utf-8", "ignore").splitlines():
        url = line.strip()
        if url.startswith(("http://", "https://")):
            subprocess.Popen(
                ["open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
