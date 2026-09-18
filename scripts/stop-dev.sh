#!/usr/bin/env bash
set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
REMOVE_IMAGES=false
if [[ "$1" == "--rmi" ]] || [[ "$1" == "-i" ]]; then
  REMOVE_IMAGES=true
fi

cd "$(dirname "$0")/.."

echo -e "${YELLOW}🛑 Stopping Coding Pal development environment...${NC}"

if [[ "$REMOVE_IMAGES" == true ]]; then
  docker compose -f docker/docker-compose.yml down --rmi all
  echo -e "${RED}✅ Development environment stopped and images removed!${NC}"
else
  docker compose -f docker/docker-compose.yml down
  echo -e "${RED}✅ Development environment stopped!${NC}"
  echo -e "Run '${YELLOW}./scripts/stop-dev.sh --rmi${NC}' to also remove Docker images."
fi
