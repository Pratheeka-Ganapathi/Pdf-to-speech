FROM python:3.11-slim

WORKDIR /app

# poppler-utils: pdf2image renders 4 pages
# espeak-ng: Kokoro TTS G2P
# ffmpeg: WAVtoMP3 conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    espeak-ng \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# PyTorch with CUDA
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu121

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Kokoro model
RUN python -c "from kokoro import KPipeline; KPipeline(lang_code='a')" 2>/dev/null || true

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
