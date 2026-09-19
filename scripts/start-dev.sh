#!/usr/bin/env bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cd "$(dirname "$0")/.."

echo -e "${YELLOW}🚀 Starting Coding Pal development environment...${NC}"

# Build and start services using Docker Compose
docker compose -p coding-pal -f docker/docker-compose.yml up --build -d

echo -e ""
echo -e "${GREEN}✅ Coding Pal documentation website is running!${NC}"
echo -e "📖 Open in browser: ${YELLOW}http://localhost:5174/docs/${NC}"
echo -e ""
echo -e "Run '${YELLOW}./scripts/stop-dev.sh${NC}' to stop the container."
echo -e "Run '${YELLOW}docker compose -p coding-pal -f docker/docker-compose.yml logs -f${NC}' to view logs."
