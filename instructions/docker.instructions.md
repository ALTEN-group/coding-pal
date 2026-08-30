---
description: "Docker/Compose workflow pattern for a multi-service Node.js stack (API + migrations + Angular admin + docs site + mocks) behind Traefik, with dev/prod dockerfile pairs, BuildKit secrets for private registries, and env-driven naming. Use when scaffolding or modifying docker/, dockerfile(s), or docker lifecycle scripts."
applyTo: "docker/**,**/dockerfile*,**/.dockerignore,scripts/**/*.sh"
---

# Docker Workflow Instructions

When scaffolding compose/Dockerfiles/scripts or matching full snippets, follow the installed `docker-examples` skill (read its `references/examples.md`).

## Naming (env-driven)

- `APP_NAME` = short slug; `ENV_NAME` = `local` | `production` | …
- `STACK_NAME=${APP_NAME}-${ENV_NAME}` — Traefik constraint so stacks share a host safely.
- `container_name` / `hostname`: `${APP_NAME}-<service>-${ENV_NAME}` (main app container may be just `${APP_NAME}`).
- Networks: `${APP_NAME}-internal-${ENV_NAME}`, `${APP_NAME}-external-${ENV_NAME}` (explicit names).
- Image tags: `<org>/<service>[-<subservice>]:${VERSION}` plus `:latest`. Main-app `VERSION` from `package.json` at build time; compose defaults `${VERSION:-latest}`.

## File layout

```
docker/
  docker-compose.yml              # dev: build from source, bind-mounts
  docker-compose.prod.yml         # prod: pre-built images
  docker-compose-admin.prod.yml   # admin deployed independently in prod
  conf/
    .env.dev.example              # committed template, blank secrets
    .env.dev                      # gitignored, from scripts/setup-env.sh
    .env.prod                     # committed; secrets filled at deploy
```

Each buildable sub-app owns `dockerfile` + `dockerfile.prod` next to its source — not one shared dockerfile.

## Compose anchors

Define shared fragments once (`x-*: &name`) and reuse with `<<: *name` / `*name`: healthcheck, secret build args, secret mounts, default build args/envs.

## Dockerfile — dev vs prod

**Dev:** single stage, `npm i --ignore-scripts --no-fund`, copy only `package*.json` (source bind-mounted), `CMD ["node", "--run", "dev"]`.

**Prod:** multi-stage; `deps` with `npm ci --only=production`; final stage copies `node_modules` + `package.json` + `src`, then removes `npm`/`npx`/`corepack` binaries. Frontends: build stage + `nginx` final stage with custom conf and `dist/`.

**Every dockerfile:** non-root `user` with build-arg `UID`/`GID` matching the host.

## Private registry / BuildKit secrets

- Mount secrets for private Alpine mirrors and npmrc during build (`required=true`).
- Compose `secrets:` from env vars — never committed secret files.
- `NPMRC_PATH` = `${HOME_PATH}.npmrc` for the non-root user.
- `scripts/build-prod.sh` passes `--secret id=...,env=...` to plain `docker build`.

## Migration (Liquibase) container

- Extend `liquibase/liquibase:${LIQUIBASE_VERSION}`; add `postgresql-client` + `curl` as root; drop to `liquibase` user; root-owned `entrypoint.sh` (`chmod=755`).
- Dev bind-mounts changelog; prod `COPY`s changelog; optional `/liquibase/data` `VOLUME`.
- Entrypoint dispatches on env (`UPDATE` / `ROLLBACK` / else diff-sync); snapshot/log files opt-in via `LIQUIBASE_ENABLE_*`.
- App DB grants scoped per schema (`public` + `log`), not superuser.

## Postgres container

Extend official image; `COPY` init script into `/docker-entrypoint-initdb.d/` to create multiple DBs from `POSTGRES_DBS`.

## Traefik / routing

- One Traefik per stack, constrained by `stack.name` = `${APP_NAME}-${ENV_NAME}`.
- Routed services: `traefik.enable=true`, `stack.name`, `PathPrefix` rules, `web` entrypoint, optional `stripprefix`.
- Dev-only dashboard (`--api.insecure` / `--api.dashboard`); disabled in prod.
- Documentation site: routed in dev only. Its service, port, and publication are owned by the `vitepress-docs` instruction.

## Startup ordering

Use `depends_on` with conditions: Postgres healthy → migrations; Postgres healthy + migration `service_completed_successfully` → app.

## Dev bind-mounts

- Mount only live-reload paths (`src`, `tests`, configs) — not the whole repo root.
- Host `node_modules` bind mounts for services with host `npm install`; named volumes otherwise.
- `start-dev.sh` must `mkdir -p` host `node_modules` dirs before `up`.

## `scripts/*.sh` conventions

- Always pass `-f docker/docker-compose*.yml` and `--env-file docker/conf/.env.*` explicitly.
- Never `source` env files that define `UID=` into a shell that treats `UID` as read-only — use `grep`/`cut` or exclude that line.
- `setup-env.sh`: copy example → `.env.dev`, generate secrets, cross-platform `sedi`.
- `stop-dev.sh`: optional image removal; always remove named `postgres_data` volume.
- `build-prod.sh` / `start-prod.sh`: tag with `${VERSION}` and `latest`; optional per-service build args.
- `reset-*.sh`: tear down one service (container + images + volume) then restart.

## `.dockerignore`

Exclude tests, docs, `.github`, VCS/log/coverage artifacts — keep build context minimal per sub-app.
