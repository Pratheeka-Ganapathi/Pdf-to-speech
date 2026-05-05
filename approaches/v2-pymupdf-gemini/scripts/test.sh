#!/bin/bash
set -e

echo "📖 PDF to Speech - Running Tests"
echo "============================="
echo ""

cd "$(dirname "$0")/../backend"

# Create venv if needed
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install -r requirements.txt pytest -q

echo ""
python -m pytest tests/ -v --tb=short
