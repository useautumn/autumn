#!/bin/sh

# Check for LOCAL_TUNNEL_RESERVED_KEY environment variable first
if [ -z "$LOCALTUNNEL_RESERVED_KEY" ]; then
  # Read LOCAL_TUNNEL_RESERVED_KEY from .env file if env var not set
  if [ -f "/app/server/.env" ]; then
    export $(cat /app/server/.env | grep LOCALTUNNEL_RESERVED_KEY | grep -v '^#')
  fi
fi

# Set default subdomain if env var not found
if [ -z "$LOCALTUNNEL_RESERVED_KEY" ]; then
  LOCALTUNNEL_RESERVED_KEY="autumn-dev"
fi

echo "Installing localtunnel..."
echo "Reserved key: ${LOCAL_TUNNEL_RESERVED_KEY}"
bun install -g localtunnel


echo "Server is ready! Starting localtunnel..."
lt --port 8080 --local-host server --subdomain ${LOCALTUNNEL_RESERVED_KEY} --print-requests