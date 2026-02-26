#!/bin/bash
# Stop hook: verify frontend build after Claude finishes responding
# Runs a full craco build to catch any broken imports/JSX
# Exit 0 = ok, Exit 2 = block (report build error)

PROJECT_DIR="/Users/gs/Documents/MK-proptech/.claude/worktrees/trusting-chaplygin/frontend"

# Check if any frontend source files were modified in the last 5 minutes
RECENT_CHANGES=$(find "$PROJECT_DIR/src" -name "*.js" -o -name "*.jsx" -newer "$PROJECT_DIR/build" 2>/dev/null | head -1)

# If no recent frontend changes, skip build
if [ -z "$RECENT_CHANGES" ] && [ -d "$PROJECT_DIR/build" ]; then
  exit 0
fi

cd "$PROJECT_DIR"
BUILD_OUTPUT=$(CI=true npx craco build 2>&1)
BUILD_EXIT=$?

if [ $BUILD_EXIT -ne 0 ]; then
  echo "❌ Frontend build failed:" >&2
  echo "$BUILD_OUTPUT" | grep -A 5 "ERROR\|Error\|Failed\|error" | head -30 >&2
  exit 2
fi

exit 0
