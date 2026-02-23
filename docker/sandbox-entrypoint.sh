#!/bin/sh
set -e

# ── 1. Apply generated schema to Postgres ────────────────────────────────────
echo "[sandbox] Applying schema..."
bun /app/docker/sandbox-schema-apply.ts
echo "[sandbox] Schema ready"

# ── 2. Start Vite dev server ──────────────────────────────────────────────────
echo "[sandbox] Starting Vite dev server on port ${VITE_PORT:-3000}..."
cd /app/vite
bun dev &

# ── 3. Start BullMQ workers ───────────────────────────────────────────────────
echo "[sandbox] Starting workers..."
cd /app/server
bun src/workers.ts &

# ── 4. Start API server (foreground) ─────────────────────────────────────────
echo "[sandbox] Starting API server on port ${SERVER_PORT:-8080}..."
cd /app/server
exec bun src/index.ts
