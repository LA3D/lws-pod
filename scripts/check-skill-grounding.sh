#!/usr/bin/env bash
# Enforces the grounded-spec-skills contract (see docs/superpowers/specs/2026-06-20-grounded-spec-skills-design.md)
set -euo pipefail

check_one() {
  local d="$1" fail=0
  local name; name="$(basename "$d")"
  [ -f "$d/SKILL.md" ]    || { echo "[$name] FAIL: missing SKILL.md"; return 1; }
  [ -f "$d/UPSTREAM.md" ] || { echo "[$name] FAIL: missing UPSTREAM.md"; return 1; }
  [ -d "$d/references" ] && [ -n "$(ls -A "$d/references" 2>/dev/null)" ] \
    || { echo "[$name] FAIL: references/ empty or missing"; return 1; }

  # required frontmatter keys in SKILL.md
  for k in name description when_to_use upstream license; do
    grep -qE "^${k}:" "$d/SKILL.md" || { echo "[$name] FAIL: SKILL.md missing frontmatter '$k:'"; fail=1; }
  done

  # Layer 1 stays thin
  local n; n="$(wc -l < "$d/SKILL.md")"
  [ "$n" -le 80 ] || { echo "[$name] FAIL: SKILL.md is $n lines (>80, not thin)"; fail=1; }

  # contamination scan — authored files ONLY (references are verbatim, exempt)
  if grep -nEi '\bD[0-9]{1,3}\b|we decided|research question|hypothesis|\bTODO\b|\bTBD\b' \
       "$d/SKILL.md" "$d/UPSTREAM.md" >/tmp/contam.$$  2>/dev/null; then
    echo "[$name] FAIL: contamination tokens in authored files:"; cat /tmp/contam.$$; fail=1
  fi
  rm -f /tmp/contam.$$

  # separation seam: exactly one project-application pointer
  grep -qiE 'lws-pod.s application|project memory|docs/foundations' "$d/SKILL.md" \
    || { echo "[$name] FAIL: SKILL.md missing project-application pointer line"; fail=1; }

  # provenance present
  grep -qiE 'http' "$d/UPSTREAM.md" || { echo "[$name] FAIL: UPSTREAM.md has no source URL"; fail=1; }
  grep -qiE 'sha|snapshot|date' "$d/UPSTREAM.md" || { echo "[$name] FAIL: UPSTREAM.md has no sha/snapshot"; fail=1; }

  [ "$fail" -eq 0 ] && echo "[$name] OK"
  return "$fail"
}

rc=0
if [ "$#" -ge 1 ]; then
  check_one "${1%/}" || rc=1
else
  for d in .claude/skills/*/; do [ -d "$d" ] || continue; check_one "${d%/}" || rc=1; done
fi
exit "$rc"
