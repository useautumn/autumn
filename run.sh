if [[ $1 == *"docker-compose"* ]]; then
    if [[ $2 == "down" ]]; then
        docker compose -f "$1" down $3
    else
        if [[ $3 == *"--build"* ]]; then
            docker compose -f "$1" up --build
        else
            docker compose -f "$1" up $3
        fi
    fi
fi
