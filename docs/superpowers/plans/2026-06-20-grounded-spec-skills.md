# Grounded Spec Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build six pure-spec, progressively-disclosed skills under `.claude/skills/` whose reference content is verbatim from pinned authoritative sources, with zero project/research contamination.

**Architecture:** Each skill = thin `SKILL.md` (Layer 1 routing) + `references/` (Layer 2 verbatim source text) + `UPSTREAM.md` (provenance). A grep-based grounding-check script enforces the no-contamination invariant and structural completeness; it is the "test" each skill task must pass. Project application stays out of skills — `SKILL.md` carries a pointer to `memory/` + `docs/foundations/` only.

**Tech Stack:** Bash, `gh` (GitHub API/raw), `curl` (hackmd), no build step. Skills are plain markdown auto-discovered by Claude Code.

## Global Constraints

- Grounding boundary (D1): a skill contains ONLY authoritative spec content. No project decisions, D-numbers, eval results, hypotheses, or open research questions inside any skill file authored by us (`SKILL.md`, `UPSTREAM.md`).
- Source fidelity (D3): `references/*` are VERBATIM bytes from the pinned source — never paraphrased, never hand-edited. Use raw fetches (`gh api`/`curl`), never WebFetch (it summarizes).
- Provenance: every skill's `UPSTREAM.md` records source URL, repo+sha (GitHub) or snapshot date (HTML/hackmd), and license.
- Layer 1 stays thin: `SKILL.md` ≤ 80 lines, no embedded spec prose.
- Separation seam: each `SKILL.md` ends with exactly one project-application pointer line, naming `memory/` notes and `docs/foundations/` — a pointer, never the content.
- Git: feature branch `skills/grounded-spec-skills` (already created). Stage specific files. Commit prefix `[Agent: Claude]`. Footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Pinned shas captured during probing: `w3c/lws-protocol` `91e6d6e2f3a2840883df9792d7ddfa9a78808200`; `w3c/lws-ucs` `9bb23408d31f5150072c191ec250664a6a2e2258`; `GoogleCloudPlatform/knowledge-catalog` `e911292cc1e1a5cfe3d0f8420219f0115d07f31e`; `solid/specification` `2a0b59bd01365b7055583b861ba95a0b8c0f6fdc`; `comunica/website` `83288f9ff911480dbed20e8352122f8b7156140e`. SHACL (`w3c/data-shapes`) sha is captured at fetch time (its default branch is non-standard).

---

## Task 1: Grounding-check harness + scaffold

**Files:**
- Create: `scripts/check-skill-grounding.sh`
- Create: `.claude/skills/.gitkeep`

**Interfaces:**
- Produces: `scripts/check-skill-grounding.sh <skill-dir>` — exits 0 if the skill satisfies the grounding contract, non-zero with a printed reason otherwise. Consumed as the verification step of every later task. With no arg, checks all `.claude/skills/*/`.

- [ ] **Step 1: Write the check script**

```bash
cat > scripts/check-skill-grounding.sh <<'SCRIPT'
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
SCRIPT
chmod +x scripts/check-skill-grounding.sh
mkdir -p .claude/skills && touch .claude/skills/.gitkeep
```

- [ ] **Step 2: Verify the harness fails on an empty skills tree**

Run: `bash scripts/check-skill-grounding.sh`
Expected: exit 0 with no output (no skills yet — the loop has nothing to check). This confirms the script runs clean; per-skill failure behavior is exercised in Step 3.

- [ ] **Step 3: Verify the harness fails on an incomplete skill**

Run: `mkdir -p .claude/skills/_probe && bash scripts/check-skill-grounding.sh .claude/skills/_probe; echo "rc=$?"; rm -rf .claude/skills/_probe`
Expected: prints `[_probe] FAIL: missing SKILL.md` and `rc=1`.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-skill-grounding.sh .claude/skills/.gitkeep
git commit -m "$(cat <<'EOF'
[Agent: Claude] skills: grounding-check harness + scaffold

- scripts/check-skill-grounding.sh enforces the no-contamination invariant,
  thin-SKILL.md bound, verbatim references, and provenance presence
- references/ exempt from contamination scan (verbatim by contract)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `lws-protocol` skill

**Files:**
- Create: `.claude/skills/lws-protocol/references/` — all eight LWS 1.0 modules, vendored verbatim
- Create: `.claude/skills/lws-protocol/UPSTREAM.md`
- Create: `.claude/skills/lws-protocol/SKILL.md`
- Test: `scripts/check-skill-grounding.sh .claude/skills/lws-protocol`

**Interfaces:**
- Consumes: `scripts/check-skill-grounding.sh` (Task 1).
- Produces: discoverable skill `lws-protocol`.

The eight LWS 1.0 modules (per https://w3c.github.io/lws-protocol/): `lws10-core` (Core),
`lws10-vocab` (Vocabulary), `lws10-authn-openid` (OpenID Connect authn), `lws10-authn-saml`
(SAML 2.0 authn), `lws10-authn-ssi-cid` (self-signed CID authn), `lws10-authn-ssi-did-key`
(self-signed did:key authn), `lws10-notifications` (Notifications), `lws10-searchindex`
(Search and Type Index Services). All are vendored — plus `lws-ucs` use cases as companion.

- [ ] **Step 1: Vendor all eight modules verbatim via pinned tarball**

```bash
S=.claude/skills/lws-protocol/references; mkdir -p "$S"
SHA_P=91e6d6e2f3a2840883df9792d7ddfa9a78808200
SHA_U=9bb23408d31f5150072c191ec250664a6a2e2258
TMP=$(mktemp -d)
# whole repo at pinned sha → copy the eight module dirs verbatim
gh api "repos/w3c/lws-protocol/tarball/$SHA_P" > "$TMP/lws.tgz"
tar -xzf "$TMP/lws.tgz" -C "$TMP"
SRC=$(find "$TMP" -maxdepth 1 -type d -name 'w3c-lws-protocol-*')
for m in lws10-core lws10-vocab lws10-authn-openid lws10-authn-saml \
         lws10-authn-ssi-cid lws10-authn-ssi-did-key lws10-notifications lws10-searchindex; do
  cp -R "$SRC/$m" "$S/$m"
done
# use cases (companion)
gh api "repos/w3c/lws-ucs/tarball/$SHA_U" > "$TMP/ucs.tgz"
tar -xzf "$TMP/ucs.tgz" -C "$TMP"
USRC=$(find "$TMP" -maxdepth 1 -type d -name 'w3c-lws-ucs-*')
mkdir -p "$S/lws-ucs"; cp -R "$USRC/spec/." "$S/lws-ucs/"
# prune non-spec noise: old dated snapshots and stylesheets (keep all normative docs)
find "$S" -type d -name SNAPSHOTS -prune -exec rm -rf {} +
find "$S" -name '*.css' -delete
rm -rf "$TMP"
```

- [ ] **Step 2: Verify all eight modules vendored and non-empty**

Run: `ls -1 .claude/skills/lws-protocol/references/ && for m in lws10-core lws10-vocab lws10-authn-openid lws10-authn-saml lws10-authn-ssi-cid lws10-authn-ssi-did-key lws10-notifications lws10-searchindex; do test -s ".claude/skills/lws-protocol/references/$m/index.html" && echo "ok: $m" || echo "MISSING index: $m"; done`
Expected: nine entries listed (eight modules + `lws-ucs`); eight `ok:` lines.

- [ ] **Step 3: Write UPSTREAM.md**

```bash
cat > .claude/skills/lws-protocol/UPSTREAM.md <<'EOF'
# Upstream provenance — lws-protocol

All eight LWS 1.0 modules + use cases, verbatim, unmodified (SNAPSHOTS/ and *.css pruned).

| Reference | Module | Snapshot |
|---|---|---|
| references/lws10-core/ | Core protocol | w3c/lws-protocol sha 91e6d6e2f3a2840883df9792d7ddfa9a78808200 |
| references/lws10-vocab/ | Vocabulary | same sha |
| references/lws10-authn-openid/ | OpenID Connect Authentication Suite | same sha |
| references/lws10-authn-saml/ | SAML 2.0 Authentication Suite | same sha |
| references/lws10-authn-ssi-cid/ | Self-signed Controlled Identifier Authentication Suite | same sha |
| references/lws10-authn-ssi-did-key/ | Self-signed did:key Authentication Suite | same sha |
| references/lws10-notifications/ | Notifications | same sha |
| references/lws10-searchindex/ | Search and Type Index Services | same sha |
| references/lws-ucs/ | Use cases | w3c/lws-ucs sha 9bb23408d31f5150072c191ec250664a6a2e2258 |

Repo: https://github.com/w3c/lws-protocol — rendered: https://w3c.github.io/lws-protocol/
Use cases: https://github.com/w3c/lws-ucs — rendered: https://w3c.github.io/lws-ucs/spec/
License: W3C Software and Document License (see each module's source). Verbatim, unmodified.
EOF
```

- [ ] **Step 4: Write the thin SKILL.md**

```bash
cat > .claude/skills/lws-protocol/SKILL.md <<'EOF'
---
name: lws-protocol
description: W3C Linked Web Storage (LWS) Protocol 1.0 — all eight modules: core, vocabulary, four authentication suites (OpenID Connect, SAML 2.0, self-signed CID, self-signed did:key), notifications, and search/type index. The Solid standardization JSS implements. Verbatim spec, pinned.
when_to_use: When checking JSS behavior against any part of the LWS 1.0 spec — core operations/resource ID/conneg, the LWS vocabulary, any of the four authentication suites (incl. the self-signed CID / did:key identity primitives), notifications, or search/type index services. Ground truth only; for how lws-pod applies it see the pointer below.
upstream: see UPSTREAM.md
license: W3C Software and Document License
---

# LWS Protocol 1.0 (W3C) — grounded reference

Verbatim W3C source for all eight modules, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| Core operations, resource identification, conneg, container representation | `references/lws10-core/` |
| The LWS RDF vocabulary | `references/lws10-vocab/` |
| Self-signed agent identity (the LWS-CID primitive) | `references/lws10-authn-ssi-cid/` |
| Self-signed did:key identity | `references/lws10-authn-ssi-did-key/` |
| OpenID Connect authentication | `references/lws10-authn-openid/` |
| SAML 2.0 authentication | `references/lws10-authn-saml/` |
| Change notifications | `references/lws10-notifications/` |
| Search and Type Index Services | `references/lws10-searchindex/` |
| Why LWS exists / target use cases | `references/lws-ucs/` |

## Related skills

`solid-protocol` (the Solid base LWS standardizes), `shacl-constraints`, `okf`.

---
*lws-pod's application: see project memory `[[lws-protocol]]` and `docs/foundations/`. Not in this skill.*
EOF
```

- [ ] **Step 5: Run the grounding check**

Run: `bash scripts/check-skill-grounding.sh .claude/skills/lws-protocol`
Expected: `[lws-protocol] OK`

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/lws-protocol
git commit -m "$(cat <<'EOF'
[Agent: Claude] skills: lws-protocol (verbatim W3C LWS, pinned)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `okf` skill

**Files:**
- Create: `.claude/skills/okf/references/`, `UPSTREAM.md`, `SKILL.md`
- Test: `scripts/check-skill-grounding.sh .claude/skills/okf`

**Interfaces:**
- Consumes: Task 1 harness. Produces: skill `okf`.

- [ ] **Step 1: Vendor verbatim (pinned by sha)**

```bash
S=.claude/skills/okf/references; mkdir -p "$S"
SHA_K=e911292cc1e1a5cfe3d0f8420219f0115d07f31e
for f in SPEC.md README.md LICENSE.md; do
  gh api "repos/GoogleCloudPlatform/knowledge-catalog/contents/okf/$f?ref=$SHA_K" --jq '.content' | base64 -d > "$S/$f"
done
```

- [ ] **Step 2: Verify**

Run: `wc -c .claude/skills/okf/references/SPEC.md`
Expected: > 1000 bytes.

- [ ] **Step 3: Write UPSTREAM.md**

```bash
cat > .claude/skills/okf/UPSTREAM.md <<'EOF'
# Upstream provenance — okf

| Reference | Source | Snapshot |
|---|---|---|
| references/SPEC.md, README.md, LICENSE.md | https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf | sha e911292cc1e1a5cfe3d0f8420219f0115d07f31e |

Announcement: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing
License: see references/LICENSE.md. Verbatim, unmodified.
EOF
```

- [ ] **Step 4: Write SKILL.md**

```bash
cat > .claude/skills/okf/SKILL.md <<'EOF'
---
name: okf
description: Open Knowledge Format (OKF) v0.1 — Google Cloud's vendor-neutral spec for portable agent knowledge as directories of markdown + YAML frontmatter. Verbatim spec, pinned.
when_to_use: When designing or validating the wiki-memory content shape against OKF — directory layout, index.md conventions, frontmatter fields (type/title/description/resource/tags/timestamp). Ground truth only.
upstream: see UPSTREAM.md
license: see references/LICENSE.md
---

# Open Knowledge Format — grounded reference

Verbatim OKF source, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| The normative format — directory model, frontmatter fields, index conventions | `references/SPEC.md` |
| Overview, motivation, examples | `references/README.md` |
| Licensing / reuse terms | `references/LICENSE.md` |

## Related skills

`semantic-markdown` (in-document RDF annotation), `solid-protocol` (storage substrate).

---
*lws-pod's application: see project memory `[[open-knowledge-format]]` and `docs/wiki-memory-dual-projection.md`. Not in this skill.*
EOF
```

- [ ] **Step 5: Run the grounding check**

Run: `bash scripts/check-skill-grounding.sh .claude/skills/okf`
Expected: `[okf] OK`

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/okf
git commit -m "$(cat <<'EOF'
[Agent: Claude] skills: okf (verbatim OKF v0.1, pinned)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `semantic-markdown` skill

**Files:**
- Create: `.claude/skills/semantic-markdown/references/`, `UPSTREAM.md`, `SKILL.md`
- Test: `scripts/check-skill-grounding.sh .claude/skills/semantic-markdown`

**Interfaces:**
- Consumes: Task 1 harness. Produces: skill `semantic-markdown`.

- [ ] **Step 1: Vendor verbatim (hackmd raw markdown, snapshot by date)**

```bash
S=.claude/skills/semantic-markdown/references; mkdir -p "$S"
curl -sL "https://hackmd.io/@sparna/semantic-markdown-draft/download" -o "$S/semantic-markdown-draft.md"
```

- [ ] **Step 2: Verify**

Run: `wc -c .claude/skills/semantic-markdown/references/semantic-markdown-draft.md && head -5 .claude/skills/semantic-markdown/references/semantic-markdown-draft.md`
Expected: > 1000 bytes, content is the draft markdown (not an HTML error page).

- [ ] **Step 3: Write UPSTREAM.md** (capture today's date for the snapshot)

```bash
cat > .claude/skills/semantic-markdown/UPSTREAM.md <<'EOF'
# Upstream provenance — semantic-markdown

| Reference | Source | Snapshot |
|---|---|---|
| references/semantic-markdown-draft.md | https://hackmd.io/@sparna/semantic-markdown-draft | snapshot date 2026-06-20 (alpha draft; no sha — living hackmd doc) |

Author/host: Sparna. Status: Alpha Draft. Verbatim export, unmodified.
EOF
```

- [ ] **Step 4: Write SKILL.md**

```bash
cat > .claude/skills/semantic-markdown/SKILL.md <<'EOF'
---
name: semantic-markdown
description: Semantic Markdown (Sparna) — "RDFa Lite for Markdown". Curly-brace annotations embed RDF (typeof/property/resource) in human-readable markdown. Verbatim alpha draft, snapshotted.
when_to_use: When evaluating inline RDF/typed-edge annotation in concept-card bodies — the {.class}, {property}, {=resource} syntax and its RDFa Lite mapping and scopes. Ground truth only; alpha draft (no sha, date-pinned).
upstream: see UPSTREAM.md
license: see source (hackmd, Sparna)
---

# Semantic Markdown — grounded reference

Verbatim hackmd export, date-pinned in `UPSTREAM.md`. Alpha draft. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| Annotation syntax, RDFa Lite mapping, scopes (span/block/tree/siblings) | `references/semantic-markdown-draft.md` |

## Related skills

`okf` (the file/directory container shape), `solid-protocol` (conneg of RDF).

---
*lws-pod's application: see project memory `[[semantic-markdown-spec]]` and `docs/foundations/02-content-model.md`. Not in this skill.*
EOF
```

- [ ] **Step 5: Run the grounding check**

Run: `bash scripts/check-skill-grounding.sh .claude/skills/semantic-markdown`
Expected: `[semantic-markdown] OK`

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/semantic-markdown
git commit -m "$(cat <<'EOF'
[Agent: Claude] skills: semantic-markdown (verbatim Sparna draft, date-pinned)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `solid-protocol` skill

**Files:**
- Create: `.claude/skills/solid-protocol/references/`, `UPSTREAM.md`, `SKILL.md`
- Test: `scripts/check-skill-grounding.sh .claude/skills/solid-protocol`

**Interfaces:**
- Consumes: Task 1 harness. Produces: skill `solid-protocol`.

- [ ] **Step 1: Vendor verbatim (pinned by sha)**

```bash
S=.claude/skills/solid-protocol/references; mkdir -p "$S"
SHA_S=2a0b59bd01365b7055583b861ba95a0b8c0f6fdc
for f in protocol.html wac.html oidc.html oidc-primer.html; do
  gh api "repos/solid/specification/contents/$f?ref=$SHA_S" --jq '.content' | base64 -d > "$S/$f"
done
```

- [ ] **Step 2: Verify**

Run: `wc -c .claude/skills/solid-protocol/references/protocol.html .claude/skills/solid-protocol/references/wac.html`
Expected: both > 1000 bytes.

- [ ] **Step 3: Write UPSTREAM.md**

```bash
cat > .claude/skills/solid-protocol/UPSTREAM.md <<'EOF'
# Upstream provenance — solid-protocol

| Reference | Source | Snapshot |
|---|---|---|
| references/protocol.html | https://github.com/solid/specification (protocol.html) — rendered: https://solidproject.org/TR/protocol | sha 2a0b59bd01365b7055583b861ba95a0b8c0f6fdc |
| references/wac.html | https://github.com/solid/specification (wac.html) — rendered: https://solidproject.org/TR/wac | sha 2a0b59bd01365b7055583b861ba95a0b8c0f6fdc |
| references/oidc.html, oidc-primer.html | https://github.com/solid/specification — rendered: https://solidproject.org/TR/oidc | sha 2a0b59bd01365b7055583b861ba95a0b8c0f6fdc |

License: W3C Software and Document License (Solid CG). Verbatim, unmodified.
Note: SHACL / ldp:constrainedBy (Protocol §5.6) text lives in references/protocol.html; see the shacl-constraints skill for the SHACL spec itself.
EOF
```

- [ ] **Step 4: Write SKILL.md**

```bash
cat > .claude/skills/solid-protocol/SKILL.md <<'EOF'
---
name: solid-protocol
description: Solid Protocol — LDP resources/containers, Web Access Control (WAC), and Solid-OIDC. The base spec JSS and the constrained-container proxy build on. Verbatim spec, pinned.
when_to_use: When implementing or checking conneg, container/LDP semantics, ACL/WAC authorization, Solid-OIDC token flow, or the ldp:constrainedBy mechanism (Protocol §5.6). Ground truth only.
upstream: see UPSTREAM.md
license: W3C Software and Document License
---

# Solid Protocol — grounded reference

Verbatim Solid CG source, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| Resources, containers, LDP, conneg, ldp:constrainedBy (§5.6) | `references/protocol.html` |
| Access control modes, ACL resources, authorization | `references/wac.html` |
| Solid-OIDC token flow / DPoP | `references/oidc.html` |
| OIDC flow walkthrough | `references/oidc-primer.html` |

## Related skills

`lws-protocol` (the W3C standardization), `shacl-constraints` (the SHACL spec), `comunica-sparql`.

---
*lws-pod's application: see project memory and `docs/foundations/`; the SHACL admission proxy is `constrained-container/`. Not in this skill.*
EOF
```

- [ ] **Step 5: Run the grounding check**

Run: `bash scripts/check-skill-grounding.sh .claude/skills/solid-protocol`
Expected: `[solid-protocol] OK`

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/solid-protocol
git commit -m "$(cat <<'EOF'
[Agent: Claude] skills: solid-protocol (verbatim Solid CG protocol/wac/oidc, pinned)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `shacl-constraints` skill

**Files:**
- Create: `.claude/skills/shacl-constraints/references/`, `UPSTREAM.md`, `SKILL.md`
- Test: `scripts/check-skill-grounding.sh .claude/skills/shacl-constraints`

**Interfaces:**
- Consumes: Task 1 harness. Produces: skill `shacl-constraints`.

- [ ] **Step 1: Vendor verbatim (SHACL REC source; capture sha at fetch time)**

```bash
S=.claude/skills/shacl-constraints/references; mkdir -p "$S"
DB=$(gh api repos/w3c/data-shapes --jq '.default_branch')
SHA_D=$(gh api "repos/w3c/data-shapes/commits/$DB" --jq '.sha')
echo "data-shapes default branch=$DB sha=$SHA_D"   # recorded into UPSTREAM.md in Step 3
gh api "repos/w3c/data-shapes/contents/shacl/index.html?ref=$SHA_D" --jq '.content' | base64 -d > "$S/shacl-spec.html"
gh api "repos/w3c/data-shapes/contents/shacl/shacl.ttl?ref=$SHA_D"   --jq '.content' | base64 -d > "$S/shacl.ttl"
printf '%s' "$SHA_D" > /tmp/shacl_sha
```

- [ ] **Step 2: Verify**

Run: `wc -c .claude/skills/shacl-constraints/references/shacl-spec.html`
Expected: > 1000 bytes.

- [ ] **Step 3: Write UPSTREAM.md** (substitute the captured sha)

```bash
SHA_D=$(cat /tmp/shacl_sha)
cat > .claude/skills/shacl-constraints/UPSTREAM.md <<EOF
# Upstream provenance — shacl-constraints

| Reference | Source | Snapshot |
|---|---|---|
| references/shacl-spec.html | https://github.com/w3c/data-shapes (shacl/index.html) — rendered: https://www.w3.org/TR/shacl/ | sha ${SHA_D} |
| references/shacl.ttl | https://github.com/w3c/data-shapes (shacl/shacl.ttl) | sha ${SHA_D} |

The ldp:constrainedBy mechanism (Solid Protocol §5.6) is in the solid-protocol skill (references/protocol.html).
License: W3C Software and Document License. Verbatim, unmodified.
EOF
```

- [ ] **Step 4: Write SKILL.md**

```bash
cat > .claude/skills/shacl-constraints/SKILL.md <<'EOF'
---
name: shacl-constraints
description: SHACL (Shapes Constraint Language) W3C spec plus the SHACL ontology — the constraint language behind constrained containers (ldp:constrainedBy). Verbatim spec, pinned.
when_to_use: When authoring or validating SHACL shapes for admission control — node/property shapes, targets, constraint components, severity, validation reports. The ldp:constrainedBy wiring is in solid-protocol. Ground truth only.
upstream: see UPSTREAM.md
license: W3C Software and Document License
---

# SHACL — grounded reference

Verbatim W3C SHACL source, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| Node/property shapes, targets, constraint components, validation reports, severity | `references/shacl-spec.html` |
| The SHACL vocabulary itself (machine-readable) | `references/shacl.ttl` |
| How a container declares a shape (ldp:constrainedBy, §5.6) | `solid-protocol` → `references/protocol.html` |

## Related skills

`solid-protocol` (constrainedBy mechanism), `lws-protocol`.

---
*lws-pod's application: the SHACL admission proxy is `constrained-container/`; governance rationale in `docs/foundations/03-governance-lessons.md`. Not in this skill.*
EOF
```

- [ ] **Step 5: Run the grounding check**

Run: `bash scripts/check-skill-grounding.sh .claude/skills/shacl-constraints`
Expected: `[shacl-constraints] OK`

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/shacl-constraints
git commit -m "$(cat <<'EOF'
[Agent: Claude] skills: shacl-constraints (verbatim W3C SHACL, pinned)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
rm -f /tmp/shacl_sha
```

---

## Task 7: `comunica-sparql` skill

**Files:**
- Create: `.claude/skills/comunica-sparql/references/`, `UPSTREAM.md`, `SKILL.md`
- Test: `scripts/check-skill-grounding.sh .claude/skills/comunica-sparql`

**Interfaces:**
- Consumes: Task 1 harness. Produces: skill `comunica-sparql`.

- [ ] **Step 1: Vendor verbatim docs (pinned by sha)**

```bash
S=.claude/skills/comunica-sparql/references; mkdir -p "$S"
SHA_C=83288f9ff911480dbed20e8352122f8b7156140e
for f in "1_query.md" "1_query/2_usage.md" "1_query/3_faq.md" "1_query/advanced.md" \
         "1_query/1_getting_started/3_query_app.md" "1_query/1_getting_started/4_query_browser_app.md"; do
  out="$S/$(basename "$f")"
  gh api "repos/comunica/website/contents/pages/docs/$f?ref=$SHA_C" --jq '.content' | base64 -d > "$out"
done
```

- [ ] **Step 2: Verify**

Run: `ls -1 .claude/skills/comunica-sparql/references/ && wc -c .claude/skills/comunica-sparql/references/2_usage.md`
Expected: files present; usage doc > 500 bytes.

- [ ] **Step 3: Write UPSTREAM.md**

```bash
cat > .claude/skills/comunica-sparql/UPSTREAM.md <<'EOF'
# Upstream provenance — comunica-sparql

| Reference | Source | Snapshot |
|---|---|---|
| references/*.md | https://github.com/comunica/website (pages/docs/1_query/*) — rendered: https://comunica.dev/docs/ | sha 83288f9ff911480dbed20e8352122f8b7156140e |

License: see comunica/website repo (MIT). Verbatim, unmodified.
EOF
```

- [ ] **Step 4: Write SKILL.md**

```bash
cat > .claude/skills/comunica-sparql/SKILL.md <<'EOF'
---
name: comunica-sparql
description: Comunica — client-side SPARQL over Solid/Linked Data sources, including link traversal over ldp:contains aggregates. Verbatim docs, pinned.
when_to_use: When querying pod data client-side with Comunica — configuring sources, query-from-app vs browser, link traversal across containers, common usage and FAQ. Ground truth only.
upstream: see UPSTREAM.md
license: MIT
---

# Comunica (client-side SPARQL) — grounded reference

Verbatim Comunica docs, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| What Comunica is / query overview | `references/1_query.md` |
| Usage patterns, configuring sources | `references/2_usage.md` |
| Querying from a JS app / in the browser | `references/3_query_app.md`, `references/4_query_browser_app.md` |
| Advanced (link traversal, etc.) | `references/advanced.md` |
| Common problems | `references/3_faq.md` |

## Related skills

`solid-protocol` (the data it queries), `lws-protocol`.

---
*lws-pod's application: verified `.graph`-aggregate patterns and the traqula override live in `docs/foundations/04-comunica-patterns.md`. Not in this skill.*
EOF
```

- [ ] **Step 5: Run the grounding check**

Run: `bash scripts/check-skill-grounding.sh .claude/skills/comunica-sparql`
Expected: `[comunica-sparql] OK`

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/comunica-sparql
git commit -m "$(cat <<'EOF'
[Agent: Claude] skills: comunica-sparql (verbatim Comunica docs, pinned)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Layer-0 router README + full verification

**Files:**
- Create: `.claude/skills/README.md`
- Delete: `.claude/skills/.gitkeep`
- Test: `scripts/check-skill-grounding.sh` (all)

**Interfaces:**
- Consumes: all six skills (Tasks 2–7) + harness (Task 1).

- [ ] **Step 1: Write the Layer-0 router**

```bash
rm -f .claude/skills/.gitkeep
cat > .claude/skills/README.md <<'EOF'
# Grounded spec skills

Pure-spec, progressively-disclosed reference skills for lws-pod. **Grounding contract:** every
file in a skill is verbatim from a pinned authoritative source (`UPSTREAM.md`). No project
decisions, eval results, or research questions live in a skill — those stay in `memory/` and
`docs/foundations/`. Each `SKILL.md` only *points* to where lws-pod applies the spec.

| Skill | Grounds | Repo surface |
|---|---|---|
| `lws-protocol` | W3C LWS 1.0 — all 8 modules (core, vocab, 4 authn suites, notifications, search/type index) + use cases | `--idp` headless auth, `--provision-keys` LWS-CID identity, `--notifications` |
| `solid-protocol` | Solid Protocol (LDP, WAC, Solid-OIDC) | `--conneg`, ACL/WAC, OIDC, `ldp:constrainedBy` |
| `shacl-constraints` | W3C SHACL | `constrained-container/` admission proxy |
| `comunica-sparql` | Comunica client-side SPARQL | `.graph`-aggregate traversal |
| `okf` | Open Knowledge Format v0.1 | wiki-memory content model |
| `semantic-markdown` | Semantic Markdown (RDFa-Lite-for-md) | inline RDF in concept cards |

Provenance for each is in its `UPSTREAM.md`. Verify the contract with
`scripts/check-skill-grounding.sh`.
EOF
```

- [ ] **Step 2: Run the full grounding check across all six skills**

Run: `bash scripts/check-skill-grounding.sh; echo "rc=$?"`
Expected: six `OK` lines (lws-protocol, okf, semantic-markdown, solid-protocol, shacl-constraints, comunica-sparql) and `rc=0`.

- [ ] **Step 3: Confirm no contamination slipped into any authored file**

Run: `grep -rnEi '\bD[0-9]{1,3}\b|we decided|research question|hypothesis' .claude/skills/*/SKILL.md .claude/skills/*/UPSTREAM.md .claude/skills/README.md; echo "rc=$?"`
Expected: `rc=1` (grep finds nothing).

- [ ] **Step 4: Confirm skills are discoverable (frontmatter parses)**

Run: `for f in .claude/skills/*/SKILL.md; do head -1 "$f" | grep -q '^---' && echo "ok: $f" || echo "BAD: $f"; done`
Expected: six `ok:` lines.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/README.md
git rm --cached .claude/skills/.gitkeep 2>/dev/null || true
git commit -m "$(cat <<'EOF'
[Agent: Claude] skills: Layer-0 router README + grounding contract

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- D1 pure-spec/project-separate → enforced by harness contamination scan + separation-seam pointer (Tasks 1, 8) and every SKILL.md pointer line.
- D2 six skills, repo surface → Tasks 2–7, one per skill, matching the design's scope table.
- D3 verbatim snapshots → every skill Step 1 uses raw `gh api … | base64 -d` / `curl`, never WebFetch; provenance in UPSTREAM.md.
- Three-layer disclosure → Layer 0 README (Task 8), Layer 1 SKILL.md (thin, ≤80 lines, checked), Layer 2 references (verbatim).
- Success criteria (six skills present, verbatim, no contamination, routing+pointer, README, discoverable) → Task 8 Steps 2–4 verify each.

**Placeholder scan:** every Step has concrete commands and full file content. The only fetch-time-resolved value is the SHACL sha (Task 6), captured by an exact command and substituted into UPSTREAM.md — deterministic, not a placeholder.

**Type/name consistency:** skill directory names, the harness invocation, and the README table all use the same six names (`lws-protocol`, `okf`, `semantic-markdown`, `solid-protocol`, `shacl-constraints`, `comunica-sparql`). `check-skill-grounding.sh` signature is consistent across all task test steps.

**Risk note (verbatim large files):** `solid-protocol/protocol.html`, `wac.html`, and `shacl-constraints/shacl-spec.html` are large respec HTML documents. Acceptable per design (Layer 2, on-demand). If a fetched HTML file turns out to be a respec *shell* that loads content via JS rather than inlined prose, fall back to the rendered dated-version URL via `curl -L` and pin by date — note this in UPSTREAM.md.
