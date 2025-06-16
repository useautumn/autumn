if [[ $1 == *"docker-compose"* ]]; then
    docker compose -f "$1" up
fi
