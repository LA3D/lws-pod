# Agent operating skills — the how-to layer over the LWS memory substrate

**Status: architecture / framing note (the "eventually").** Captured 2026-07-04 from the design
dialogue. Not build scope for now — it names a distinction and a target that the near-term grounding +
Plan 2 work should be built *toward*, so the eventual operating-skill layer isn't retrofitted. Design-notes
are deliberation, not canon.

---

## The distinction: two skill classes with opposite contracts

"Skill" has been doing two jobs. Separate them explicitly or they corrupt each other.

| | **Grounding-reference skill** | **Agent-operating skill** |
|---|---|---|
| Content | **verbatim upstream spec**, pinned | **authored procedure** (multi-step how-to, recovery) |
| Contract | *no project decisions* (`check-skill-grounding.sh`) | *is* project knowledge; cites the reference skills |
| Audience | the developer-agent **building** the substrate | any production agent **using** a pod as memory |
| Answers | "what is the format?" (declarative) | "how do I read/write/navigate it?" (procedural) |
| Home today | `.claude/skills/` (verbatim, `references/`) | does not exist yet — a **new class** |

The contracts are opposites: the reference skill *forbids* project knowledge; the operating skill *is*
project knowledge. So **operating skills cannot live under the grounded-skills contract** — they'd trip the
grounding check. They are a distinct layer that *references* the grounded specs as ground truth. Getting
that separation on record is the first structural decision (where they live, how the grounding check
excludes them, how they cite the reference skills).

## The prototype already exists — the Obsidian vault

The vault (`~/Obsidian/obsidian`) is a working memory system with a full operating-skill set:
`encode` (write a typed note + wire it into MOCs), `retrieve` (progressive-disclosure loading with a
budget), `review-note`/`audit`/`curator` (integrity + navigation health), `vault-kg` (typed-graph query).
Built on CoALA memory partitions, typed edges as interface operations, bounded branching, hierarchical
retrieval. **These are exactly "agent-operating skills for a memory format" — just Obsidian-specific.**

So the general LWS operating skills are not greenfield: they are the **generalization of the vault's
skills off Obsidian onto the standards-based substrate** — the same operations (write a typed card,
navigate the typed neighborhood, progressively disclose what won't fit in context), but over
`@context` / SHACL shapes / real-URI reads instead of wikilinks + Dataview. The vault *proves* the
pattern; the work is lifting it onto the portable substrate.

## Layer them the same recursive way as `@context`

- **Base — `linked-web-memory` (general, harness-installed, portable).** How *any* agent operates *any*
  LWS pod: the read loop (storage-description → resources → typed edges → resolve `@context`), the
  governed write (typed card → SHACL admission → recover from the teaching-error), and the extended-memory
  navigation. Cites the JSON-LD / LWS / MCP / SHACL / PROF reference skills. This is the skill an agent's
  harness ships with.
- **Profile — pod-served (specific).** How to operate *this* profile's memory (its concept vocabulary,
  its edge semantics). **The pod serves this** (the SEP-2640 / skill-resource track). The base skill knows
  how to bootstrap; the pod fills in its own specifics.

This split *is* the affordance principle at the procedure level: the memory carries its own operating
manual. The endgame is a harness with **one** meta-skill — *"on attaching to an LWS pod, read `pod-info`,
then fetch and follow its operating skills"* — and everything profile-specific comes from the pod. The
ultimate "no APIs you're programmed for": the agent isn't even programmed with the *procedure*; the memory
teaches it.

**Gate (the consumption-model finding).** For pod-served operating skills to be *autonomously* usable, they
must be reachable on a **model-driven** path (a skill-fetch tool / harness bootstrap), not only the MCP
Resources primitive (host-surfaced context). This is the same fix the affordance surface needs
(model-driven reads) — one level up. Building the substrate to *carry and expose its own how-to* on a
model-driven path is an architectural bet to commit early, because it shapes Plan 2 and the SEP-2640 track.

## The two memory tiers = two sections of the base skill

- **Working / "in-memory format"** — read/write a card and its immediate typed neighborhood; the pod as
  active memory.
- **Extended memory structure** — navigate memory that *won't fit in context*: handle-first, follow typed
  edges, drill on demand (storage-description → type-index → shape → card). This section **is** the
  hierarchical-retrieval / progressive-disclosure thesis, productized as an operating procedure.

## The pipeline: the harness is the R&D, the operating skills are the productization

Don't author the operating skills from first principles — **distill them from what actually works.** The
`experiments/agent-eval` harness is the discovery loop: the read→navigate→write→recover trajectories a cold
agent *successfully* takes become the documented steps of an operating skill; the places it *stalls* become
the sections that need a better affordance (or the profile vocabulary Plan 2 publishes). Harness = R&D;
operating skills = productization.

## Sequencing (where this lands in the arc)

1. **Reference groundings** — the missing bases: **JSON-LD** (data-axis base), **PROF/profiles**
   (profile-authority), **MCP** (interface-axis base, for the affordance correction). *Do these next* so
   building each part has its documentation.
2. **Affordance surface fix** (model-driven reads) — the substrate must be *autonomously navigable* first.
3. **Plan 2** — profile mechanism + published profile `@context`/vocab + PROF. Now there's a stable,
   self-describing thing to operate.
4. **Harness + ablations** — prove which read/write/navigate procedures work for a cold agent.
5. **Distill** the proven procedures into the layered operating skills (base `linked-web-memory` +
   pod-served profile skills), generalizing the vault's skills onto the substrate.

Operating skills come **last** — but the substrate is built *toward* them from now, per the model-driven /
pod-served gate above.

## Related

- `docs/design-notes/contextual-linked-memory.md` — the *why* of the substrate (context cards, the
  `@context` loop); the operating skills are how an agent *works* that loop.
- `docs/superpowers/specs/2026-07-03-mcp-affordance-surface-design.md` — the surface the base operating
  skill drives (and the model-driven-reads correction the pod-served skill model depends on).
- The Obsidian vault's `.claude/skills/` (encode/retrieve/curator/audit/vault-kg) — the proven prototype.
- SEP-2640 / `modelcontextprotocol/experimental-ext-skills` — the (experimental) pod-served-skills track.
