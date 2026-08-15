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

Compose: top-level `secrets:` from env vars (`APK_REPOSITORY`, `NPMRC`), never committed files.

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

Routed service labels: `traefik.enable=true`, `stack.name=${STACK_NAME}`, `PathPrefix` rules, `web` entrypoint, optional `stripprefix`.
