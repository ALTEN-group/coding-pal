#!/usr/bin/env bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cd "$(dirname "$0")/.."

# Check if target pattern or skill argument is provided
if [ $# -eq 0 ]; then
  echo -e "${BLUE}🧪 Running entire skill test suite (node:test)...${NC}"
  node --test --test-reporter=spec skills/*/scripts/*.test.mjs
elif [ "$1" == "--lint" ]; then
  echo -e "${BLUE}🔍 Checking Persistent Context standards (context-lint)...${NC}"
  node skills/context-health/scripts/context-lint.mjs --root .
elif [ -d "skills/$1" ]; then
  echo -e "${BLUE}🧪 Running test suite for skill '$1'...${NC}"
  node --test --test-reporter=spec skills/"$1"/scripts/*.test.mjs
else
  echo -e "${BLUE}🧪 Running tests matching '$*'...${NC}"
  node --test --test-reporter=spec "$@"
fi

echo -e ""
echo -e "${GREEN}✅ Tests completed successfully!${NC}"
