#!/bin/zsh

set -e

echo "🚀 Starting Conductor workspace setup for Autumn..."

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "❌ Error: Bun is not installed."
    echo "Please install Bun from https://bun.sh"
    exit 1
fi

echo "✅ Bun found: $(bun --version)"

# Determine root path - use CONDUCTOR_ROOT_PATH if set, otherwise use git root
if [ -n "$CONDUCTOR_ROOT_PATH" ]; then
    ROOT_PATH="$CONDUCTOR_ROOT_PATH"
else
    # Fallback for manual testing - go up two directories from .conductor/workspace
    ROOT_PATH="$(cd "$(dirname "$0")/../.." && pwd)"
fi

echo "📂 Root path: $ROOT_PATH"

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Copy .env files from root repo
echo "📋 Copying .env files from root repository..."

if [ -f "$ROOT_PATH/server/.env" ]; then
    mkdir -p server
    cp "$ROOT_PATH/server/.env" server/.env
    echo "✅ Copied server/.env"
else
    echo "⚠️  Warning: $ROOT_PATH/server/.env not found"
fi

if [ -f "$ROOT_PATH/vite/.env" ]; then
    mkdir -p vite
    cp "$ROOT_PATH/vite/.env" vite/.env
    echo "✅ Copied vite/.env"
else
    echo "⚠️  Warning: $ROOT_PATH/vite/.env not found"
fi

if [ -f "$ROOT_PATH/shared/.env" ]; then
    mkdir -p shared
    cp "$ROOT_PATH/shared/.env" shared/.env
    echo "✅ Copied shared/.env"
else
    echo "⚠️  Warning: $ROOT_PATH/shared/.env not found"
fi

# Copy drizzle migration files
if [ -d "$ROOT_PATH/shared/drizzle" ]; then
    echo "📋 Copying database migration files..."
    mkdir -p shared/drizzle
    cp -r "$ROOT_PATH/shared/drizzle/"* shared/drizzle/
    echo "✅ Copied migration files"
fi

# Build shared workspace (required for other workspaces)
echo "🔨 Building shared workspace..."
bun -F @autumn/shared build

echo "🎉 Workspace setup complete!"
echo ""
echo "Next: Click the 'Run' button to start the development server"