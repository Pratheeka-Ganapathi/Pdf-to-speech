#!/bin/bash
set -e

echo "📖 PDF to Speech - Run Frontend Locally (no Docker)"
echo "================================================="
echo ""

cd "$(dirname "$0")/../frontend"

# Check Node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Install it from https://nodejs.org"
    exit 1
fi

# Install if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "🚀 Starting frontend at http://localhost:3000"
echo "   Press Ctrl+C to stop"
echo ""

npm run dev
