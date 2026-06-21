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
