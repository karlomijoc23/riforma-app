#!/bin/bash
# PostToolUse hook: lint Python files after Edit/Write
# Receives JSON on stdin with tool_input.file_path
# Exit 0 = proceed, Exit 2 = block (report lint errors to Claude)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# Only run on backend Python files
if [[ "$FILE_PATH" == *"/backend/"* ]] && [[ "$FILE_PATH" =~ \.py$ ]]; then
  VENV="/Users/gs/Documents/MK-proptech/backend/.venv/bin"
  LINT_OUTPUT=$("$VENV/flake8" "$FILE_PATH" 2>&1)
  LINT_EXIT=$?

  if [ $LINT_EXIT -ne 0 ]; then
    echo "$LINT_OUTPUT" >&2
    exit 2
  fi
fi

exit 0
