#!/usr/bin/env bash
# Hook tests: each case "name|expected-exit"
H="${1:-$(cd "$(dirname "$0")" && pwd)/push-guard.sh}"; fail=0; W=$(mktemp -d); cd "$W" || exit 1
new(){ cd "$W"; rm -rf "$W/t"; mkdir "$W/t"; cd "$W/t"; git init -q -b main; git config user.email a@b; git config user.name t; echo a>a; git add .; git commit -qm base; git update-ref refs/remotes/origin/main HEAD; mkdir -p .claude/tasks src; }
run(){ echo '{"tool_input":{"command":"git push origin main"}}' | CLAUDE_PROJECT_DIR=$PWD "$H" 2>/dev/null; }
chk(){ run; got=$?; if [ "$got" = "$2" ]; then echo "ok   $1"; else echo "FAIL $1 (got $got want $2)"; fail=1; fi; }
cm(){ git add -A; git commit -qm "$1"; }
new; mkdir nfl; echo x>nfl/s; cm cap; chk "capture-only passes" 0
new; echo y>src/x.js; echo "## Verification">.claude/tasks/f.md; cm code; chk "code + unsigned task blocked" 2
echo "Signed off by Anton 2026-11-11">>.claude/tasks/f.md; cm so; chk "code + signed task passes" 0
new; echo y>src/x.js; echo "## Verification">.claude/tasks/f.md; echo "**Signed off by Anton 2026-11-11**">>.claude/tasks/f.md; cm code; chk "bold sign-off accepted" 0
new; echo y>src/x.js; cm "code"; chk "code, no task, no msg line blocked" 2
new; echo y>src/x.js; cm $'code\n\nSigned off by Anton 2026-11-11'; chk "code, commit-message sign-off passes" 0
new; echo y>src/x.js; cm $'code\n\nSigned off by Anton 2026-11-11'; echo z>src/y.js; cm "more"; chk "one code commit unsigned blocked" 2
new; echo "## Verification">.claude/tasks/f.md; cm add; chk "new task unsigned blocked" 2
new; echo "x">.claude/tasks/f.md; cm add; git update-ref refs/remotes/origin/main HEAD; echo more>>.claude/tasks/f.md; cm edit; chk "edit to existing task passes" 0
new; echo "- a">.claude/tasks/data-repo-backlog.md; echo r>.claude/tasks/app-repo-backlog-resolved.md; echo r>.claude/tasks/roadmap.md; cm bl; chk "exempt files pass" 0
new; echo y>src/x.js; echo "## Verification">.claude/tasks/f.md; cm code; PATH_SAVE=$PATH
mkdir -p "$W/nojq"; for b in git grep cat bash env dirname; do ln -sf "$(command -v $b)" "$W/nojq/$b"; done
echo '{"tool_input":{"command":"git push origin main"}}' | PATH="$W/nojq" CLAUDE_PROJECT_DIR=$PWD /bin/bash "$H" 2>/dev/null; got=$?; [ $got = 2 ] && echo "ok   no-jq fails closed" || { echo "FAIL no-jq (got $got)"; fail=1; }
echo '{"tool_input":{"command":"git status"}}' | CLAUDE_PROJECT_DIR=$PWD "$H"; [ $? = 0 ] && echo "ok   non-push passes" || fail=1
exit $fail
