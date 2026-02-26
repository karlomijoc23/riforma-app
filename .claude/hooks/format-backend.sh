#!/bin/bash
# PostToolUse hook: auto-format Python files after Edit/Write
# Receives JSON on stdin with tool_input.file_path

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# Only run on backend Python files
if [[ "$FILE_PATH" == *"/backend/"* ]] && [[ "$FILE_PATH" =~ \.py$ ]]; then
  VENV="/Users/gs/Documents/MK-proptech/backend/.venv/bin"
  "$VENV/black" --quiet "$FILE_PATH" 2>/dev/null
  "$VENV/isort" --profile=black --quiet "$FILE_PATH" 2>/dev/null
fi

exit 0
