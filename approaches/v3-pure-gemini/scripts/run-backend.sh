#!/bin/bash
set -e

echo "📖 PDF to Speech - Run Backend Locally (no Docker)"
echo "================================================"
echo ""

cd "$(dirname "$0")/backend"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required. Install it first."
    exit 1
fi

# Create venv if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "🐍 Creating virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate

echo "📦 Installing dependencies..."
pip install -r requirements.txt -q

echo ""
echo "🚀 Starting API server at http://localhost:8000"
echo "📚 API docs at http://localhost:8000/docs"
echo "   Press Ctrl+C to stop"
echo ""

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
