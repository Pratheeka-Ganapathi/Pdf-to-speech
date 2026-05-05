#!/bin/bash
# Bring up the v3 stack with Docker Compose and wait for the API to be ready.

set -e

echo "PDF to Speech (v3) - starting up..."
echo

if ! docker info > /dev/null 2>&1; then
    echo "Docker is not running. Start Docker Desktop and try again."
    exit 1
fi

if ! grep -q "^GEMINI_API_KEY=AIza" .env 2>/dev/null; then
    echo "Warning: GEMINI_API_KEY not set in .env. v3 needs a Gemini key."
    echo "  Get one at https://aistudio.google.com/app/apikey"
    echo
fi

# Pick the GPU compose file by default. Fall back to CPU if Docker says
# nvidia is unavailable.
COMPOSE_FILE="docker-compose.yml"
if [ -f "docker-compose.cpu.yml" ] && ! docker info 2>/dev/null | grep -qi nvidia; then
    COMPOSE_FILE="docker-compose.cpu.yml"
    echo "No NVIDIA GPU detected, using CPU compose file."
fi

echo "Building containers (Kokoro download on first run can take a few minutes)..."
docker compose -f "$COMPOSE_FILE" build

echo "Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

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
