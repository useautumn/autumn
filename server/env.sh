# If arg1 is prod:
if [ "$1" = "prod" ]; then
    # If .env and .env.prod exists, then switch
    if [ -f .env ] && [ -f .env.prod ]; then
        mv .env .env.loc
        mv .env.prod .env
    fi
fi

# If arg1 is local:
if [ "$1" = "local" ]; then
    if [ -f .env ] && [ -f .env.loc ]; then
        cp .env .env.prod     # Copy current .env to .env.prod first
        cp .env.loc .env    # Copy .env.local to .env
        rm .env.loc         # Remove the .env.local file
    fi
fi
