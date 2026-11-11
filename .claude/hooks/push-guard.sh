#!/usr/bin/env bash
# PreToolUse(Bash) guard: block `git push` of code/task-file work that lacks sign-off.
# Range = origin/main..HEAD.
#  - Code changed (src/ lib/ scripts/ bin/): pass if some task file in the range has
#    "## Verification" + a sign-off line, OR every commit touching code carries a
#    "Signed off by Anton YYYY-MM-DD" line in its message.
#  - Otherwise: task files NEWLY ADDED in the range need Verification + sign-off
#    (edits to existing task files are not gated).
#  - Capture-only pushes (nothing under .claude/tasks/ or code dirs) pass.
# Sign-off line may be bold (**...**). Exempt: backlogs, *-resolved backlogs, roadmap.md.
# Fails closed when jq is missing (greps raw input). Exit 2 = block.
set -uo pipefail
input=$(cat)
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
else
  cmd=$input
fi
printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_-])git( +-C +[^ ]+)? +push( |$|"|\\)' || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
base=origin/main
git rev-parse --verify -q "$base" >/dev/null || exit 0

SIGN='^[[:space:]]*\*{0,2}Signed off by Anton[[:space:]]+[0-9]{4}-[0-9]{2}-[0-9]{2}'
changed=$(git diff --name-only "$base"..HEAD 2>/dev/null)
[ -z "$changed" ] && exit 0
code=$(printf '%s\n' "$changed" | grep -E '^(src|lib|scripts|bin)/')
exempt() { case "${1##*/}" in data-repo-backlog.md|app-repo-backlog.md|data-repo-backlog-resolved.md|app-repo-backlog-resolved.md|roadmap.md) return 0;; esac; return 1; }
signed_task() { [ -f "$1" ] && grep -q '^## Verification' "$1" && grep -Eq "$SIGN" "$1"; }

block() {
  {
    echo "push-guard: push blocked — sign-off missing."
    echo "$1"
    echo "Push only after Anton replies 'signed off' in Session 1."
  } >&2
  exit 2
}

if [ -n "$code" ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    exempt "$f" && continue
    signed_task "$f" && exit 0
  done < <(printf '%s\n' "$changed" | grep -E '^\.claude/tasks/.*\.md$')
  unsigned=""
  for c in $(git log --format=%H "$base"..HEAD -- src lib scripts bin); do
    git log -1 --format=%B "$c" | grep -Eq "$SIGN" || unsigned="$unsigned  $(git log -1 --format='%h %s' "$c")"$'\n'
  done
  [ -z "$unsigned" ] && exit 0
  block "Code changed in origin/main..HEAD, but no task file has '## Verification' + a 'Signed off by Anton YYYY-MM-DD' line, and these code commits lack one in their message:
$unsigned"
fi

bad=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  exempt "$f" && continue
  signed_task "$f" || bad="$bad  $f"$'\n'
done < <(git diff --name-only --diff-filter=A "$base"..HEAD -- .claude/tasks | grep -E '\.md$')
[ -z "$bad" ] && exit 0
block "New task files need '## Verification' + a 'Signed off by Anton YYYY-MM-DD' line:
$bad"
