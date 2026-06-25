#!/usr/bin/env python3
"""sw URL-open listener (runs on the Mac). Each message is `<box-ssh-dest>` on the
first line followed by URL(s). It opens each URL in your default browser, and for
any localhost/127/0.0.0.0 port embedded in the URL (an OAuth callback) it first
sets up `ssh -L <port>:localhost:<port>` to the box — so the browser's redirect to
localhost reaches the box's local server. Socket path is argv[1]."""
import os
import re
import socket
import subprocess
import sys
import urllib.parse

sock_path = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    "~/.config/atmn-sw/open.sock"
)
os.makedirs(os.path.dirname(sock_path), exist_ok=True)
try:
    os.unlink(sock_path)
except FileNotFoundError:
    pass

LOCAL_PORT = re.compile(r"(?:localhost|127\.0\.0\.1|0\.0\.0\.0)[:](\d+)")

server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
server.bind(sock_path)
server.listen(16)


def forward(box, port):
    # Mac:port -> box:port for ~3 min (enough for an OAuth round-trip), then closes.
    subprocess.Popen(
        ["ssh", "-fL", f"{port}:localhost:{port}",
         "-o", "StrictHostKeyChecking=accept-new", box, "sleep", "180"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


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
    lines = data.decode("utf-8", "ignore").splitlines()
    if not lines:
        continue
    box = lines[0].strip()
    for url in lines[1:]:
        url = url.strip()
        if not url.startswith(("http://", "https://")):
            continue
        if box:
            for port in set(LOCAL_PORT.findall(urllib.parse.unquote(url))):
                forward(box, port)
        subprocess.Popen(
            ["open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
