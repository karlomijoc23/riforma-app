#!/bin/bash
# PostToolUse hook: auto-format frontend files after Edit/Write
# Receives JSON on stdin with tool_input.file_path

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# Only run on frontend JS/JSX/JSON/CSS files
if [[ "$FILE_PATH" == *"/frontend/src/"* ]] && [[ "$FILE_PATH" =~ \.(js|jsx|json|css)$ ]]; then
  PROJECT_ROOT=$(echo "$FILE_PATH" | sed 's|/frontend/src/.*|/frontend|')
  npx --prefix "$PROJECT_ROOT" prettier --write "$FILE_PATH" 2>/dev/null
fi

exit 0
