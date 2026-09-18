# Coding Pal Documentation Website

VitePress product documentation website for Coding Pal, describing the persistent context catalog, markdown file schemas, and multi-harness distribution.

## Development

### Quick Start (Scripts)

From the repository root:

```bash
# Start containerized dev server with live hot-reload
./scripts/start-dev.sh

# Stop dev server
./scripts/stop-dev.sh
```

### Direct Node.js

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Build for production (GitHub Pages)
npm run build

# Preview production build locally
npm run preview
```

## Deployment

Pushes to `main` touching `website/**` automatically trigger [.github/workflows/deploy-docs.yml](../.github/workflows/deploy-docs.yml) to deploy the site to GitHub Pages.
