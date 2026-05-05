#!/bin/bash
# End-to-end smoke test against the running backend.
# Usage: ./scripts/test-flow.sh path/to/any.pdf
#    or: ./scripts/test-flow.sh   (generates a test PDF on the fly)

set -e

API="http://localhost:8000/api/v1"

echo "PDF to Speech - full flow test"
echo

if ! curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo "API not reachable at localhost:8000."
    echo "Start it with: ./start.sh  or  ./scripts/run-backend.sh"
    exit 1
fi
echo "API is up."

PDF_PATH="${1:-}"
if [ -z "$PDF_PATH" ]; then
    echo "No PDF path given; generating a small test PDF..."
    python3 -c "
import fitz
doc = fitz.open()
for i in range(5):
    page = doc.new_page()
    # Headers, footers, page numbers - the bits we expect to be filtered
    page.insert_text((50, 30), 'Company Inc. | Confidential', fontsize=9)
    page.insert_text((500, 780), f'Page {i+1} of 5', fontsize=9)
    page.insert_text((50, 780), 'www.company.com', fontsize=8)
    if i == 0:
        page.insert_text((50, 100), 'Annual Report 2025', fontsize=24)
    # Actual body text we expect to come through intact
    page.insert_text((50, 200), f'This is the body content of page {i+1}. It contains important', fontsize=12)
    page.insert_text((50, 220), 'information that the reader needs to see and the TTS engine', fontsize=12)
    page.insert_text((50, 240), 'should narrate. Headers and footers above should be filtered.', fontsize=12)
doc.save('/tmp/test-pdf-to-speech.pdf')
print('  wrote /tmp/test-pdf-to-speech.pdf (5 pages)')
" 2>/dev/null || {
    echo "Need PyMuPDF on the host to generate a test PDF. Pass one in instead: ./scripts/test-flow.sh your.pdf"
    exit 1
}
    PDF_PATH="/tmp/test-pdf-to-speech.pdf"
fi

echo
echo "Step 1: upload"
UPLOAD_RESPONSE=$(curl -s -X POST "$API/documents/upload" -F "file=@$PDF_PATH")
DOC_ID=$(echo "$UPLOAD_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  doc id: $DOC_ID"
echo "  $(echo "$UPLOAD_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['message'])")"

echo
echo "Step 2: stats"
STATS=$(curl -s "$API/documents/$DOC_ID/stats")
echo "  total blocks:     $(echo "$STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['total_blocks_extracted'])")"
echo "  body kept:        $(echo "$STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['body_blocks_kept'])")"
echo "  headers removed:  $(echo "$STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['headers_removed'])")"
echo "  footers removed:  $(echo "$STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['footers_removed'])")"
echo "  page #s removed:  $(echo "$STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['page_numbers_removed'])")"

echo
echo "Step 3: clean text (first 300 chars)"
TEXT=$(curl -s "$API/documents/$DOC_ID/text")
echo "  ---"
echo "$TEXT" | python3 -c "import sys,json; t=json.load(sys.stdin)['clean_text']; print('  ' + t[:300].replace(chr(10), chr(10)+'  '))"
echo "  ---"

echo
echo "Step 4: TTS"
TTS_RESPONSE=$(curl -s -X POST "$API/documents/$DOC_ID/tts" \
    -H "Content-Type: application/json" \
    -d '{"voice_id":"en-US-AriaNeural","speed":1.0}')
TTS_STATUS=$(echo "$TTS_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
echo "  status: $TTS_STATUS"

if [ "$TTS_STATUS" = "completed" ]; then
    AUDIO_URL="http://localhost:8000$(echo "$TTS_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['audio_url'])")"
    echo "  audio: $AUDIO_URL"

    curl -s -o /tmp/test-pdf-to-speech-audio.mp3 "$AUDIO_URL"
    SIZE=$(du -h /tmp/test-pdf-to-speech-audio.mp3 | cut -f1)
    echo "  saved to /tmp/test-pdf-to-speech-audio.mp3 ($SIZE)"
fi

echo
echo "Done. Open http://localhost:3000 to play with the same document in the UI."
