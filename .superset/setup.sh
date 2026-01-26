#!/bin/zsh

set -e

echo "Starting Superset workspace setup for Autumn..."

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "Error: Bun is not installed."
    echo "Please install Bun from https://bun.sh"
    exit 1
fi

echo "Bun found: $(bun --version)"

# Determine root path - use SUPERSET_ROOT_PATH if set, otherwise use git root
if [ -n "$SUPERSET_ROOT_PATH" ]; then
    ROOT_PATH="$SUPERSET_ROOT_PATH"
else
    # Fallback for manual testing - go up two directories from .superset/workspace
    ROOT_PATH="$(cd "$(dirname "$0")/.." && pwd)"
fi

echo "Root path: $ROOT_PATH"

# Install dependencies
echo "Installing dependencies..."
bun install

# Copy .env files from root repo
echo "Copying .env files from root repository..."

# Copy all .env* files from server/
if [ -d "$ROOT_PATH/server" ]; then
    mkdir -p server
    for env_file in "$ROOT_PATH/server"/.env*; do
        if [ -f "$env_file" ]; then
            filename=$(basename "$env_file")
            cp "$env_file" "server/$filename"
            echo "Copied server/$filename"
        fi
    done
else
    echo "Warning: $ROOT_PATH/server directory not found"
fi

# Copy all .env* files from vite/
if [ -d "$ROOT_PATH/vite" ]; then
    mkdir -p vite
    for env_file in "$ROOT_PATH/vite"/.env*; do
        if [ -f "$env_file" ]; then
            filename=$(basename "$env_file")
            cp "$env_file" "vite/$filename"
            echo "Copied vite/$filename"
        fi
    done
else
    echo "Warning: $ROOT_PATH/vite directory not found"
fi

# Copy all .env* files from shared/
if [ -d "$ROOT_PATH/shared" ]; then
    mkdir -p shared
    for env_file in "$ROOT_PATH/shared"/.env*; do
        if [ -f "$env_file" ]; then
            filename=$(basename "$env_file")
            cp "$env_file" "shared/$filename"
            echo "Copied shared/$filename"
        fi
    done
else
    echo "Warning: $ROOT_PATH/shared directory not found"
fi

# Copy all .sh files from root
echo "Copying shell scripts from root repository..."
for sh_file in "$ROOT_PATH"/*.sh; do
    if [ -f "$sh_file" ]; then
        filename=$(basename "$sh_file")
        # Skip conductor-setup.sh itself
        if [ "$filename" != "conductor-setup.sh" ]; then
            cp "$sh_file" "$filename"
            chmod +x "$filename"
            echo "Copied $filename"
        fi
    fi
done

# Copy run.sh explicitly from root
if [ -f "$ROOT_PATH/run.sh" ]; then
    cp "$ROOT_PATH/run.sh" "run.sh"
    chmod +x "run.sh"
    echo "Copied run.sh"
fi

# Copy all .sh files from server/
echo "Copying shell scripts from server directory..."
if [ -d "$ROOT_PATH/server" ]; then
    mkdir -p server
    for sh_file in "$ROOT_PATH/server"/*.sh; do
        if [ -f "$sh_file" ]; then
            filename=$(basename "$sh_file")
            cp "$sh_file" "server/$filename"
            chmod +x "server/$filename"
            echo "Copied server/$filename"
        fi
    done
else
    echo "Warning: $ROOT_PATH/server directory not found"
fi

# Copy all .sh files from server/shell/
echo "Copying shell scripts from server/shell directory..."
if [ -d "$ROOT_PATH/server/shell" ]; then
    mkdir -p server/shell
    for sh_file in "$ROOT_PATH/server/shell"/*.sh; do
        if [ -f "$sh_file" ]; then
            filename=$(basename "$sh_file")
            cp "$sh_file" "server/shell/$filename"
            chmod +x "server/shell/$filename"
            echo "Copied server/shell/$filename"
        fi
    done
else
    echo "Warning: $ROOT_PATH/server/shell directory not found"
fi

# Copy drizzle migration files
if [ -d "$ROOT_PATH/shared/drizzle" ]; then
    echo "Copying database migration files..."
    mkdir -p shared/drizzle
    cp -r "$ROOT_PATH/shared/drizzle/"* shared/drizzle/
    echo "Copied migration files"
fi

echo "Workspace setup complete!"
echo ""
echo "Next: Start the development server with 'bun run dev:bun'"
