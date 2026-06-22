# Finding: `jss install` on JSS v0.0.209 — BLOCKED by root ACL (gates Task 11)

Date: 2026-06-22 · Spike for the wiki-memory app plan (Task 0).

## Verdict

**BLOCKED** — but at the pod **ACL layer**, not in the `install` command itself.
`jss install` authenticates and runs correctly; the git push to `/public/apps/<name>/`
returns **403**. The documented manual git dual-push fallback (app-install.md §"How it
works") goes through the *same* ACL-gated git HTTP backend and hits the *same* 403, so it
is **not** an escape from this block. Task 11 must first provision write access to the
install target (remediation below).

## What was run

Pod: `make up` → `lws-pod:0.0.209` (CMD has `--idp --conneg --git --provision-keys`),
reachable at `http://localhost:3838/` (`200`).

```
# install attempt (inside the container, against the local pod):
jss install chrome --pod http://localhost:3000 --user alice --password alicepassword123
→ ✗ chrome: push failed
  fatal: unable to access 'http://localhost:3000/public/apps/chrome/': The requested URL returned error: 403
  0/1 installed.
```

`jss install --help` (v0.0.209) options: `--pod`, `--user`, `--password`,
`--nostr-privkey`, `--bundle`. **No `--path`/`--target`** — the pod path is hardcoded to
`/public/apps/<name>/`; the `=<name>` suffix only renames the last segment, still under
`/public/apps/`.

## Root cause

The pod's **root `.acl`** (`data/.acl`) grants only:

```jsonld
{ "@id": "#public", "acl:agentClass": "foaf:Agent",
  "acl:accessTo": "./", "acl:mode": ["acl:Read"] }
```

No agent has `acl:Write`/`acl:Control` at the root, and `/public/` does not exist. Alice's
authority is scoped to `/alice/` (her own `.acl` grants Read/Write/Control + `acl:default`
there). Confirmed with alice's bearer:

| Request | Result |
|---|---|
| `PUT /public/` (BasicContainer) | **403** — root unwritable |
| `PUT /alice/test-write/` (BasicContainer) | **201** — alice owns her space |
| `DELETE /alice/test-write/` | 204 (cleanup) |

`--provision-keys` did **not** create a Nostr privkey at `/data/private/` on this build, so
the Nostr/NIP-98 install path is not wired here either; both auth paths still land a push at
the unwritable `/public/`.

## Remediation for Task 11 (pick one)

- **(A) Grant write at the install target (keeps the `/public/apps/` convention; lets
  `jss install` work).** The root `.acl` is the host-bind-mounted `data/.acl`, so the
  operator edits it directly (no agent has root `acl:Control` to do it over HTTP). Add an
  authorization granting alice's WebID
  (`http://localhost:3838/alice/profile/card.jsonld#me`) `acl:Read, acl:Write, acl:Control`
  on `./` with `acl:default`, restart the pod, then `jss install … --user alice --password
  …` (or a manual dual-push) to `/public/apps/wiki-memory/` succeeds. Narrower variant:
  pre-create just `/public/` + `/public/apps/` as alice with an alice-write `.acl` instead
  of opening the whole root.
- **(B) Install into alice's own writable space (zero ACL change; manual-push only).**
  `jss install` can't target it (hardcoded `/public/apps/`), so dual-push the `app/` tree to
  `/alice/apps/wiki-memory/` (alice already has Write there) and serve from
  `http://localhost:3838/alice/apps/wiki-memory/`.

**Recommendation:** (A) — it preserves the documented `/public/apps/` path and keeps the
one-command `jss install` story intact for the demo; (B) is the no-config fallback if we
want to avoid touching the root ACL. Task 11 step 2 should branch on this rather than the
plan's original WORKS/BLOCKED dichotomy (the plan's "manual dual-push" fallback alone does
not clear the 403).
