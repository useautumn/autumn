#!/bin/sh

# Read LOCALTUNNEL_RESERVED_KEY from .env file
if [ -f "/app/server/.env" ]; then
  export $(cat /app/server/.env | grep LOCALTUNNEL_RESERVED_KEY)
fi

# Set default subdomain if env var not found
if [ -z "$LOCALTUNNEL_RESERVED_KEY" ]; then
  echo "No LOCALTUNNEL_RESERVED_KEY found in .env, exiting..."
  exit 0
fi

echo "LOCALTUNNEL_RESERVED_KEY: ${LOCALTUNNEL_RESERVED_KEY}"

echo "Installing localtunnel..."
npm install -g localtunnel

echo "Starting localtunnel..."
lt --port 8080 --local-host server --subdomain ${LOCALTUNNEL_RESERVED_KEY} --print-requests 