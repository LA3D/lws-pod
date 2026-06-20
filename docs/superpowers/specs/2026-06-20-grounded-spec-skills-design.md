# Grounded spec skills for lws-pod — design

**Date:** 2026-06-20
**Status:** approved (design); pending implementation plan
**Branch:** `skills/grounded-spec-skills`

## Problem

The previous repo (`cogitarelink-solid`) shipped ~21 SOLID skills. They were *distillations
contaminated with research questions and project decisions*. In `shacl-shapes/SKILL.md`, the
SHACL 1.2 explanation and the project's own decisions (`D7`, `D38`, `D78`, `D98 supersedes
D77`), CSS extension paths, and overlay scripts share the same sentences. An agent reading
them cannot tell where the spec ends and a project hypothesis begins. That is a grounding
failure: ground truth and speculation are indistinguishable.

For lws-pod we want the opposite: **plain skills grounded in authoritative specs and best
practices**, with zero research contamination.

## Goal

Make the project's reference specs available through progressive disclosure as a small set of
**pure-spec skills** — each one ground truth, pinned to an authoritative source — while keeping
lws-pod's own application of those specs entirely separate.

## Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Grounding boundary | **Pure spec, project separate.** A skill contains only authoritative spec content. Project application lives in `memory/` and `docs/foundations/`, never in a skill. |
| D2 | Coverage (first pass) | **Repo surface.** Six skills matching what lws-pod actually exercises (the README eval checklist + the four foundations docs). |
| D3 | Source fidelity | **Verbatim snapshots.** Vendor authoritative source text as-is into `references/`, pinned with provenance. `SKILL.md` is the thin progressive-disclosure index over it. No paraphrase = no drift. |

## Scope — the six skills

```
.claude/skills/
  lws-protocol/        # W3C LWS: protocol + authn-CID suite + use-cases
  okf/                 # Open Knowledge Format v0.1
  semantic-markdown/   # Sparna "RDFa Lite for Markdown"
  solid-protocol/      # Solid Protocol: LDP, WAC, Solid-OIDC
  shacl-constraints/   # SHACL + ldp:constrainedBy (Solid §5.6)
  comunica-sparql/     # Comunica client-side SPARQL
```

Each maps to repo surface:

| Skill | Repo surface it grounds | Authoritative source(s) |
|---|---|---|
| `lws-protocol` | LWS-CID identity, `--idp` headless auth, `--provision-keys` | `w3c/lws-protocol` (+ `lws10-authn-ssi-cid`), `w3c/lws-ucs` |
| `okf` | wiki-memory content model, dual-projection | `GoogleCloudPlatform/knowledge-catalog/tree/main/okf` |
| `semantic-markdown` | inline RDF in concept-card bodies | `hackmd.io/@sparna/semantic-markdown-draft` |
| `solid-protocol` | `--conneg`, WAC/ACL, Solid-OIDC, LDP containers | Solid Protocol spec (LDP, WAC, Solid-OIDC) |
| `shacl-constraints` | `constrained-container/` proxy, `ldp:constrainedBy` | W3C SHACL Rec; Solid Protocol §5.6 |
| `comunica-sparql` | `.graph` aggregate traversal (foundations/04) | Comunica docs |

## Architecture — three-layer progressive disclosure

Native to Claude Code skills; no extra index machinery.

- **Layer 0 — router.** The `description` / `when_to_use` frontmatter, surfaced at session
  start. Plus a thin `.claude/skills/README.md` mapping the six skills to the README eval
  checklist and stating the grounding contract.
- **Layer 1 — orientation** (`SKILL.md`). When-to-use, a *"when to read which"* table over the
  references, related skills, and a single project-application **pointer** line. No spec prose,
  no project decisions.
- **Layer 2 — ground truth** (`references/*.md`). Verbatim source text, untouched.

## Per-skill structure

```
<skill>/
  SKILL.md           # Layer 1: routing + when-to-read table + pointer
  references/
    <doc>.md         # Layer 2: VERBATIM source text (one file per source document)
  UPSTREAM.md        # provenance: source URL, repo+sha or snapshot date, license/attribution
  LICENSE.*          # source license text where the license requires it (e.g. W3C, Apache)
```

`SKILL.md` frontmatter:

```yaml
---
name: <skill>
description: <what spec this grounds + the surfaces it covers>
when_to_use: <when an agent should open it>
upstream:
  - source: <url>
    snapshot: <sha | date>
license: <spdx>
---
```

## The separation seam (the contamination fix)

Project application never enters a skill. Each `SKILL.md` ends with one pointer line:

> *lws-pod's application: see project memory `[[lws-protocol]]` and `docs/foundations/`.*

A pointer, not content. The graph stays navigable (skill → where we apply it), but ground
truth and project decisions never share a sentence. This is the precise inversion of the
`shacl-shapes` failure where `D98 supersedes D77` lived inside the SHACL explanation.

**Invariant (enforceable by review):** if a sentence is inside a skill, it is verbatim from a
pinned source. No D-numbers, no "we decided", no open research questions, no hypotheses.

## Sourcing notes

- GitHub-hosted sources (OKF) — pull via `gh` / raw, pin the commit sha.
- W3C specs (LWS, Solid Protocol, SHACL) — snapshot the canonical document(s) in full; pin by
  date + the dated-version URL. These are the large files; that is acceptable for on-demand
  Layer 2. Routing within a large file is the `SKILL.md` table's job.
- hackmd (Semantic Markdown) — export markdown, pin by snapshot date (alpha draft).
- Comunica — snapshot the relevant docs pages, pin by date.
- Preserve each source's license/attribution in `UPSTREAM.md` (and a `LICENSE.*` file where the
  license text must travel with the copy).

## Verbatim vs. large specs — the one risk

Full W3C specs are large. "Verbatim" means snapshot the canonical document(s) per source *in
full* rather than truncating. `solid-protocol` and `shacl-constraints` references will be
sizable files. That is fine for Layer 2 (loaded on demand) and is the price of zero drift.

## Non-goals

- Not re-grounding the full ~21-skill old set — only repo surface (D2). Add more when the eval
  needs them.
- Not putting any project decision, eval result, or research question inside a skill (D1).
- Not authoring digests/distillations of specs (D3) — verbatim only.

## Success criteria

- [ ] Six skills exist under `.claude/skills/`, each with `SKILL.md` + `references/` + `UPSTREAM.md`.
- [ ] Every reference file is verbatim from its pinned source; provenance resolves.
- [ ] No skill contains a project decision, D-number, eval result, or research question.
- [ ] Each `SKILL.md` routes (when-to-read table) and points to project application without
      embedding it.
- [ ] `.claude/skills/README.md` maps the six to the README eval checklist.
- [ ] Skills are auto-discovered when working in lws-pod (verified by listing).
