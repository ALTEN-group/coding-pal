#!/usr/bin/env bash
# Install the coding-pal primitives one pipeline stage needs into a checked-out application repository.
#
# The delivery workflows (pipeline-think/plan/code/prove, audit-runner) call this instead of repeating a
# copy block per workflow. It deliberately wipes every AI-harness folder of the checkout first so the
# agent only sees the primitives of the running stage, then installs:
#   * the stage's agents, instructions and skills (STAGES below)
#   * the stack standards that match the repository (node-express, postgres-liquibase, docker, ...)
#
# Nothing here is specific to one application: stack detection is based on repository files only.
#
# Usage:
#   install-primitives.sh --stage think|plan|code|prove|audit --engine <coding-pal checkout> \
#       [--dest <repo dir>] [--agent <audit agent>] [--keep-tracked-clean]
#
# --keep-tracked-clean marks tracked files of the wiped folders as skip-worktree so that applications
# which commit their own APM output (.github/agents, .agents, .claude, ...) do not show the
# wipe/re-copy as changes in `git status` or in PR commits.

set -euo pipefail

STAGE=""
ENGINE=""
DEST="."
AGENT=""
KEEP_CLEAN="false"

while [ $# -gt 0 ]; do
  case "$1" in
    --stage) STAGE="$2"; shift 2 ;;
    --engine) ENGINE="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --agent) AGENT="$2"; shift 2 ;;
    --keep-tracked-clean) KEEP_CLEAN="true"; shift ;;
    *) echo "install-primitives: unknown argument $1" >&2; exit 2 ;;
  esac
done

[ -n "$STAGE" ] || { echo "install-primitives: --stage is required" >&2; exit 2; }
[ -d "$ENGINE" ] || { echo "install-primitives: --engine must be a directory" >&2; exit 2; }
cd "$DEST"

# ---- stage definitions: "<agents>|<instructions>|<skills>" (names without suffix) -------------------
case "$STAGE" in
  think) STAGE_DEF="think|think decision-record|think decision-record" ;;
  plan)  STAGE_DEF="plan|plan|think plan plan-fast-path" ;;
  code)  STAGE_DEF="code|code|think plan code prove release-readiness" ;;
  prove) STAGE_DEF="prove gate-fix|prove|think plan code prove release-readiness" ;;
  audit)
    [ -n "$AGENT" ] || { echo "install-primitives: --agent is required for --stage audit" >&2; exit 2; }
    STAGE_DEF="${AGENT}||" ;;
  *) echo "install-primitives: unknown stage $STAGE" >&2; exit 2 ;;
esac
STAGE_AGENTS="${STAGE_DEF%%|*}"
REST="${STAGE_DEF#*|}"
STAGE_INSTRUCTIONS="${REST%%|*}"
STAGE_SKILLS="${REST#*|}"

# ---- wipe the harness folders so only this stage's primitives are visible ---------------------------
WIPE_PATHS=".github/instructions .github/agents .github/prompts .github/skills .github/copilot-instructions.md .agents .claude .cursor .gemini CLAUDE.md GEMINI.md AGENTS.md .cursorrules .windsurfrules"

if [ "$KEEP_CLEAN" = "true" ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  git ls-files -z -- $WIPE_PATHS | xargs -0 -r git update-index --skip-worktree 2>/dev/null || true
fi

# shellcheck disable=SC2086
rm -rf $WIPE_PATHS
mkdir -p .github/instructions .github/agents .agents/skills

copy_instruction() {
  [ -f "$ENGINE/instructions/$1.instructions.md" ] && cp "$ENGINE/instructions/$1.instructions.md" .github/instructions/ || true
}
copy_agent() {
  if [ -f "$ENGINE/agents/$1.agent.md" ]; then cp "$ENGINE/agents/$1.agent.md" .github/agents/
  elif [ -f "$ENGINE/agents/$1.md" ]; then cp "$ENGINE/agents/$1.md" ".github/agents/$1.agent.md"
  else echo "install-primitives: agent '$1' not found in $ENGINE/agents" >&2; return 1; fi
}
copy_skill() {
  [ -d "$ENGINE/skills/$1" ] && cp -R "$ENGINE/skills/$1" ".agents/skills/$1" || true
}

for a in $STAGE_AGENTS; do copy_agent "$a"; done
for i in $STAGE_INSTRUCTIONS; do copy_instruction "$i"; done
for s in $STAGE_SKILLS; do copy_skill "$s"; done

# ---- stack standards: detected from repository files only -------------------------------------------
# Always: surgical-change guidelines.
copy_instruction sharp-agent

has_express="false"
if [ -f package.json ] && jq -e '((.dependencies // {}) + (.devDependencies // {})) | has("express")' package.json >/dev/null 2>&1; then
  has_express="true"
fi

[ "$has_express" = "true" ] && [ -d src ] && copy_instruction node-express
[ -f package.json ] && [ -d tests ] && copy_instruction node-unit-tests
[ -d db/liquibase ] && copy_instruction postgres-liquibase
if [ -d docker ] || ls -d dockerfile* Dockerfile* >/dev/null 2>&1; then copy_instruction docker; fi
if [ -f admin/angular.json ] || [ -f angular.json ]; then copy_instruction angular-admin; fi
if [ -d website ]; then
  copy_instruction vitepress-docs
  copy_skill vitepress-docs
fi

# Companion skills that hold templates for the detected stacks (examples are read on demand).
[ "$has_express" = "true" ] && copy_skill node-express-examples
[ -d db/liquibase ] && copy_skill postgres-liquibase-examples
if [ -d docker ]; then copy_skill docker-examples; fi
if [ -f admin/angular.json ] || [ -f angular.json ]; then copy_skill angular-admin-examples; fi

echo "install-primitives: stage=${STAGE} agents=[${STAGE_AGENTS}] instructions=$(ls .github/instructions | wc -l | tr -d ' ') skills=$(ls .agents/skills | wc -l | tr -d ' ')"
