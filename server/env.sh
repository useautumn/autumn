# Print existing env:
if [ -f .env.prod ]; then
    echo "Current env: local"
elif [ -f .env.local ]; then
    echo "Current env: local"
else
    echo "Current env: none"
fi

# If arg1 is prod:
if [ "$1" = "prod" ]; then
    # If .env and .env.prod exists, then switch
    if [ -f .env ] && [ -f .env.prod ]; then
        mv .env .env.local
        mv .env.prod .env
    fi
fi

# If arg1 is local:
if [ "$1" = "local" ]; then
    if [ -f .env ] && [ -f .env.local ]; then
        cp .env .env.prod     # Copy current .env to .env.prod first
        cp .env.local .env    # Copy .env.local to .env
        rm .env.local         # Remove the .env.local file
    fi
fi
