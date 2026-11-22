#!/usr/bin/env bash
# Bootstrap a repository for the coding-pal delivery pipeline.
#
# Everything is a DRY RUN unless --apply is given: commands that would change GitHub are printed, not executed.
# All subcommands are idempotent (labels use --force, boards and milestones are skipped when they already exist).
#
#   bootstrap.sh labels    --repo OWNER/REPO                                  [--apply]
#   bootstrap.sh board     --owner OWNER --title NAME [--template-project N]  [--apply]
#   bootstrap.sh milestone --repo OWNER/REPO --title X.Y.Z                    [--apply]
#   bootstrap.sh callers   --out DIR --project-title NAME
#                          [--engine-repo OWNER/REPO] [--engine-ref REF]
#                          [--deployment-workflow deploy-docs.yml] [--deployment-paths "website/,src/"]
#                          [--minute 17]
#       Renders templates/callers/*.yml into DIR (a repository's .github/workflows). Nothing is committed or pushed.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES="$HERE/../../templates/callers"

CMD="${1:-}"; [ $# -gt 0 ] && shift
APPLY="false"
REPO=""; OWNER=""; TITLE=""; TEMPLATE_PROJECT="4"; OUT=""; PROJECT_TITLE=""
ENGINE_REPO="ALTEN-group/coding-pal"; ENGINE_REF="v1"
DEPLOY_WF="deploy-docs.yml"; DEPLOY_PATHS="website/,.github/workflows/deploy-docs.yml"; MINUTE="17"

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY="true"; shift ;;
    --repo) REPO="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --template-project) TEMPLATE_PROJECT="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --project-title) PROJECT_TITLE="$2"; shift 2 ;;
    --engine-repo) ENGINE_REPO="$2"; shift 2 ;;
    --engine-ref) ENGINE_REF="$2"; shift 2 ;;
    --deployment-workflow) DEPLOY_WF="$2"; shift 2 ;;
    --deployment-paths) DEPLOY_PATHS="$2"; shift 2 ;;
    --minute) MINUTE="$2"; shift 2 ;;
    *) echo "bootstrap: unknown argument $1" >&2; exit 2 ;;
  esac
done

run() {
  if [ "$APPLY" = "true" ]; then
    "$@"
  else
    printf 'DRY-RUN:'; printf ' %q' "$@"; printf '\n'
  fi
}

# name|color|description
LABELS='1-think|1D76DB|Run the Think stage (specification) on this issue
2-plan|1D76DB|Run Plan (falls back to Think when no specification exists)
3-code|1D76DB|Run Code up to an open pull request
4-prove|5319E7|Validate and approve the pull request, then pause before merge
5-release|0E8A16|Run the autonomous Think, Plan, Code, Prove and Release pipeline
ready|0E8A16|Eligible for automatic start by the single-flight chain
pause:think|FBCA04|Pause the pipeline after Think
pause:plan|FBCA04|Pause the pipeline after Plan
pause:code|FBCA04|Pause the pipeline after Code
pause:prove|FBCA04|Pause the pipeline after Prove
needs:developer|D93F0B|Pipeline failed or fix-loop limit reached; developer attention required
needs:rebase|D93F0B|Pull request conflicts with the base branch
release:now|0E8A16|Ship what has merged so far without waiting for the rest of the milestone
release:patch|C2E0C6|Floor the next release at patch
release:minor|C2E0C6|Floor the next release at minor
release:major|B60205|Declare the next release major
breaking|B60205|Breaking change (OpenAPI, database migration or environment variable)
audit:dependency-leverage|C5DEF5|Finding from the dependency audit
audit:dead-code|C5DEF5|Finding from the dead-code audit
audit:test-gap|C5DEF5|Finding from the test-gap audit
audit:docs-sync|C5DEF5|Finding from the docs-sync audit
audit:a11y-audit|C5DEF5|Finding from the accessibility audit
audit:token-audit|C5DEF5|Finding from the token audit
fix-loop:1|EDEDED|Prove auto-remediation attempt 1
fix-loop:2|EDEDED|Prove auto-remediation attempt 2
fix-loop:3|EDEDED|Prove auto-remediation attempt 3
fix-loop:4|EDEDED|Prove auto-remediation attempt 4
fix-loop:5|EDEDED|Prove auto-remediation attempt 5'

case "$CMD" in
  labels)
    [ -n "$REPO" ] || { echo "labels: --repo is required" >&2; exit 2; }
    while IFS='|' read -r name color desc; do
      [ -n "$name" ] && run gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force
    done <<< "$LABELS"
    ;;

  board)
    [ -n "$OWNER" ] && [ -n "$TITLE" ] || { echo "board: --owner and --title are required" >&2; exit 2; }
    if gh project list --owner "$OWNER" --format json --limit 200 2>/dev/null | jq -e --arg t "$TITLE" '.projects[] | select(.title == $t)' >/dev/null; then
      echo "Project '${TITLE}' already exists for ${OWNER}; nothing to do."
    else
      run gh project copy "$TEMPLATE_PROJECT" --source-owner "$OWNER" --target-owner "$OWNER" --title "$TITLE"
    fi
    echo "Reminder: in the project's Workflows settings, disable the built-in automations that set Status to Done when an item is closed or a PR is merged; only the pipeline sets Done."
    ;;

  milestone)
    [ -n "$REPO" ] && [ -n "$TITLE" ] || { echo "milestone: --repo and --title are required" >&2; exit 2; }
    if gh api "repos/${REPO}/milestones?state=all&per_page=100" --jq '.[].title' 2>/dev/null | grep -qxF "$TITLE"; then
      echo "Milestone '${TITLE}' already exists in ${REPO}; nothing to do."
    else
      run gh api "repos/${REPO}/milestones" -f title="$TITLE" -f description="Release train: issues here ship together as one release."
    fi
    ;;

  callers)
    [ -n "$OUT" ] && [ -n "$PROJECT_TITLE" ] || { echo "callers: --out and --project-title are required" >&2; exit 2; }
    mkdir -p "$OUT"
    PATH_LINES=""
    IFS=',' read -r -a paths <<< "$DEPLOY_PATHS"
    for p in "${paths[@]}"; do
      [ -n "$p" ] && PATH_LINES="${PATH_LINES}        ${p}"$'\n'
    done
    PATH_LINES="${PATH_LINES%$'\n'}"
    for tpl in "$TEMPLATES"/*.yml; do
      name="$(basename "$tpl")"
      PATHS_TEXT="$PATH_LINES" awk '{ if ($0 == "__DEPLOYMENT_PATHS__") print ENVIRON["PATHS_TEXT"]; else print }' "$tpl" \
        | sed -e "s|__ENGINE_REPO__|${ENGINE_REPO}|g" \
              -e "s|__ENGINE_REF__|${ENGINE_REF}|g" \
              -e "s|__PROJECT_TITLE__|${PROJECT_TITLE}|g" \
              -e "s|__DEPLOYMENT_WORKFLOW__|${DEPLOY_WF}|g" \
              -e "s|__MINUTE__|${MINUTE}|g" > "$OUT/$name"
      echo "rendered $OUT/$name"
    done
    ;;

  *)
    sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    [ -z "$CMD" ] || exit 2
    ;;
esac
