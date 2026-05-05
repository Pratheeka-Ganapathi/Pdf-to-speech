#!/bin/bash
# Bring up the v1 stack with Docker Compose and wait for the API to be ready.

set -e

echo "PDF to Speech (v1) - starting up..."
echo

if ! docker info > /dev/null 2>&1; then
    echo "Docker is not running. Start Docker Desktop and try again."
    exit 1
fi

echo "Building containers (first run takes 2-3 minutes)..."
docker compose build

echo "Starting services..."
docker compose up -d

echo -n "Waiting for the API"
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        echo " - up."
        break
    fi
    if [ $i -eq 30 ]; then
        echo
        echo "API didn't come up in 60s. Check: docker compose logs api"
        exit 1
    fi
    sleep 2
    printf "."
done

cat <<EOF

All running.

  Frontend:   http://localhost:3000
  API:        http://localhost:8000
  API docs:   http://localhost:8000/docs

Logs:    docker compose logs -f api
Stop:    docker compose down
Rebuild: docker compose up -d --build
EOF
