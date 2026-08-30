# Docker Workflow — Examples

Companion samples for the `docker` instruction, shipped by the `docker-examples` skill. Normative rules live in the instruction; use these templates only when scaffolding.

## Non-root user pattern

```dockerfile
ARG UID
ARG GID
RUN deluser --remove-home node && addgroup -S usergroup -g ${GID} && adduser -G usergroup -S user -u ${UID}
USER user
```

## BuildKit secrets (apk + npmrc)

```dockerfile
RUN rm /etc/apk/repositories
RUN --mount=type=secret,id=apk_repository,target=/etc/apk/repositories,required=true apk update && apk add tzdata
...
ARG NPMRC_PATH
RUN --mount=type=secret,id=npmrc,target=${NPMRC_PATH},required=true,uid=${UID}
```

Compose `secrets:` from environment variables. Secret sourcing rules: see the Docker instruction.

```yaml
secrets:
  apk_repository:
    environment: APK_REPOSITORY
  npmrc:
    environment: NPMRC
```

Plain `docker build` (from `scripts/build-prod.sh`):

```bash
--secret id=apk_repository,env=APK_REPOSITORY --secret id=npmrc,env=NPMRC
```

## Compose YAML anchors (typical set)

- `x-service-healthcheck: &healthcheck` → `healthcheck: *healthcheck`
- `x-secret-args: &secretArgs` → merge into `build:` via `<<: *secretArgs`
- `x-secret-mount: &secretMount` → `secrets: *secretMount`
- `x-default-args: &defaultArgs` / `x-default-envs: &defaultEnvs` → `<<: *defaultArgs`

## Traefik constraint

```yaml
--providers.docker.constraints=Label(`stack.name`,`${APP_NAME}-${ENV_NAME}`)
```

Routed-service label names and Traefik options: see the Docker instruction.

```yaml
labels:
  - traefik.enable=true
  - stack.name=${STACK_NAME}
  - "traefik.http.routers.app.rule=PathPrefix(`/api`)"
  - traefik.http.routers.app.entrypoints=web
```

Documentation-site service block and its Pages workflow: see `vitepress-docs-examples`.
