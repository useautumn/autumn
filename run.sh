if [[ $1 == *"docker-compose"* ]]; then
    if [[ $2 == "down" ]]; then
        docker compose -f "$1" down $3
    else
        docker compose -f "$1" up $3
    fi
fi
