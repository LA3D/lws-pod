ENV  ?= local
BASE ?= http://localhost:3838
ENVFILE = .env.$(ENV)
COMPOSE = docker compose --env-file $(ENVFILE) -f docker-compose.yml -f docker-compose.$(ENV).yml

# Subprojects with their own package.json (all carry a lockfile → npm ci is reproducible).
NPM_DIRS = . projection app apps/wiki-projector experiments/headless-cid

.PHONY: setup doctor doctor-tls build up down logs reset test test-lws test-l3 test-typeindex test-indexed-relation test-mcp-v2 test-profiles test-dcat test-graph test-conneg test-void test-wiki test-projection publish-profiles test-app shell cert up-tls down-tls cid-tls up-fork-tls down-fork-tls

# One-shot bootstrap for a clean checkout: env file + every subproject's deps. Idempotent; run
# once after `git clone`. node_modules and .env.local are gitignored, so a fresh checkout has
# neither — this is the local state the build needs that the repo can't carry.
setup: $(ENVFILE)
	@for d in $(NPM_DIRS); do echo "==> npm ci ($$d)"; ( cd $$d && npm ci ) || exit 1; done
	@echo "setup done. Next: make doctor && make up && make test"

# Preflight the Docker runtime. A freshly installed/updated Docker Desktop often can't start ANY
# container (build dies at the first RUN with 'runc ... can't get final child's PID from pipe: EOF');
# the fix is a backend restart, not a repo change.
doctor:
	@docker run --rm hello-world >/dev/null 2>&1 \
	  && echo "✓ docker can start containers" \
	  || echo "✗ docker can't start containers — run 'docker desktop restart', wait, then retry."

# Preflight for the TLS rigs (cert / up-tls / cid-tls / up-fork-tls) — the host-level setup a
# fresh clone does NOT carry. Self-diagnosing: each line prints the exact fix. Run before `make
# cert`. (The non-TLS path needs only `make doctor`; these prereqs are TLS-only.)
doctor-tls:
	@echo "== TLS-rig preflight (host-level setup not in the repo) =="
	@docker run --rm hello-world >/dev/null 2>&1 \
	  && echo "✓ docker can start containers" \
	  || echo "✗ docker can't start containers — 'docker desktop restart', wait, retry (see make doctor)"
	@command -v mkcert >/dev/null 2>&1 \
	  && echo "✓ mkcert installed ($$(mkcert -CAROOT 2>/dev/null))" \
	  || echo "✗ mkcert missing — install: brew install mkcert nss   (then optional: mkcert -install)"
	@grep -q "pod.vardeman.me" /etc/hosts \
	  && echo "✓ pod.vardeman.me resolves (in /etc/hosts)" \
	  || echo "✗ pod.vardeman.me NOT in /etc/hosts — add it: echo '127.0.0.1 pod.vardeman.me' | sudo tee -a /etc/hosts"
	@lsof -nP -iTCP:443 -sTCP:LISTEN >/dev/null 2>&1 \
	  && echo "✗ host :443 is busy (up-fork-tls publishes it) — stop the listener or change the published port" \
	  || echo "✓ host :443 free (up-fork-tls)"
	@lsof -nP -iTCP:8443 -sTCP:LISTEN >/dev/null 2>&1 \
	  && echo "✗ host :8443 is busy (up-tls publishes it)" \
	  || echo "✓ host :8443 free (up-tls)"
	@echo "All ✓ → make cert && make up-fork-tls   (scheme-fix rig)   |   make cert && make up-tls && make cid-tls   (LWS-CID rig)"

# Auto-create the local env file from the template so a clean checkout's first `make up` works.
$(ENVFILE):
	cp .env.example $@
	@echo "created $@ from .env.example"

build: $(ENVFILE)
	$(COMPOSE) build

up: $(ENVFILE)
	$(COMPOSE) up -d --build
	@echo "JSS ($(ENV)) up at $(BASE)  (logs: make logs)"

down: $(ENVFILE)
	$(COMPOSE) down

logs: $(ENVFILE)
	$(COMPOSE) logs -f

# Fresh pod: stop, wipe the bind-mounted ./data, rebuild, restart.
# (On Linux, ./data may be root-owned by the container — use sudo if rm fails.)
reset: $(ENVFILE)
	$(COMPOSE) down
	rm -rf ./data
	$(COMPOSE) up -d --build
	@echo "JSS ($(ENV)) reset + up at $(BASE)"

# The local verification gate — Vitest e2e against the running pod (Task 2-3).
test: $(ENVFILE)
	@[ -d node_modules ] || npm ci
	BASE=$(BASE) npm test

# L2 live-pod gate — the LWS storage-discovery surfaces (storage description, linkset, Link rels,
# conneg) against the running FORK pod (--lws). Targets the up fork-tls rig at https://pod.vardeman.me
# (needs `make up-fork-tls` running + `make cert`'s CA so Node trusts the mkcert cert). The
# lws-discovery suite self-skips on a non-`--lws` pod, so plain `make test` (base pod) stays green.
test-lws:
	@[ -d node_modules ] || npm ci
	@[ -f certs/rootCA.pem ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=certs/rootCA.pem npx vitest run tests/lws-discovery.test.mjs

# L3 live-pod gate — SHACL admission surfaces (describedby constraint, 400 problem+json,
# violations[], describedby Link) against the running FORK pod (--lws). Mirrors test-lws
# env wiring: points BASE at the fork TLS pod and trusts the mkcert CA so Node can verify
# the cert. The lws-admission suite self-skips on a non-`--lws` pod, so plain `make test`
# stays green. Needs `make up-fork-tls` running + `make cert`'s CA.
test-l3:
	@[ -d node_modules ] || npm ci
	@[ -f certs/rootCA.pem ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=certs/rootCA.pem npx vitest run tests/lws-admission.test.mjs

# L2.5 live gate — Type Index/Search surfaces (TypeIndex/TypeSearch services,
# CNF type filter, declared-type discovery) against the running FORK pod (--lws).
# Self-skips on a non-`--lws` pod, so plain `make test` stays green. Same env
# wiring as test-l3/test-lws. Needs `make up-fork-tls` running + `make cert`'s CA.
test-typeindex:
	@[ -d node_modules ] || npm ci
	@[ -f certs/rootCA.pem ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=certs/rootCA.pem npx vitest run tests/lws-typeindex.test.mjs

# Indexed-relation gate — describedby Type-Search filter + linkset describedby.
# Self-skips on a non-`--lws` pod. Needs `make up-fork-tls` running + `make cert`'s CA.
test-indexed-relation:
	@[ -d node_modules ] || npm ci
	@[ -f certs/rootCA.pem ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=certs/rootCA.pem npx vitest run tests/lws-indexed-relation.test.mjs

# MCP v2 Resource-Gateway gate — resources/* primitive, teaching content, no-oracle,
# put_typed_resource/describe_resource. Self-skips unless initialize advertises `resources`.
# Needs `make up-fork-tls` running (fork-mcp-v2 image) + `make cert`'s CA.
test-mcp-v2:
	@[ -d node_modules ] || npm ci
	@[ -f certs/rootCA.pem ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=certs/rootCA.pem npx vitest run tests/mcp-v2.test.mjs

# Profile-mechanism live gate — needs up-fork-tls + publish-profiles run first.
test-profiles:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-profiles.test.mjs

# Zero-code DCAT onboarding gate (L4a §5) — the beforeAll IS the onboarding recipe
# (3 artifact PUTs + write_acl + .meta bind, no publish.mjs). Needs up-fork-tls + make cert.
test-dcat:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-dcat.test.mjs

# Generic graph-semantics gate (L4b Phase A) — store arbitrary named-graph JSON-LD,
# read it back, materialize union+dataset derived views. Needs up-fork-tls + make cert.
test-graph:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-graph.test.mjs

# Content-negotiation-by-profile live gate (DX-PROF-CONNEG cnpr:http) — neutral memory w/ array-@context
# .meta (the parser-fix proof). Needs `make up-fork-tls` (fork-conneg image) + `make cert`.
test-conneg:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-conneg.test.mjs

# VoID gateway live gate (spec 2026-07-11 §5) — /.well-known/void 303s to the
# pod-materialized void.jsonld; deref rail (every declared vocabulary carries
# a pod-served dump). Needs `make up-fork-tls` (fork-gateway image, --lws-void)
# + `make cert` + `make publish-profiles` (materializes void.jsonld).
test-void:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-void.test.mjs

# Cold-agent affordance harness (experiments/agent-eval). -dry = plumbing smoke
# (MCP handshake + read surface, no API key); full run needs ANTHROPIC_API_KEY.
test-agent-eval-dry:
	@[ -f certs/rootCA.pem ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first"; exit 1; }
	@[ -d experiments/agent-eval/node_modules ] || ( cd experiments/agent-eval && npm install --silent --no-audit --no-fund )
	cd experiments/agent-eval && BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem node run.mjs --dry

test-agent-eval:
	@[ -f certs/rootCA.pem ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first"; exit 1; }
	@[ -n "$$ANTHROPIC_API_KEY" ] || { echo "ANTHROPIC_API_KEY not set — the agent battery needs it (use test-agent-eval-dry for the no-key smoke)"; exit 1; }
	@[ -d experiments/agent-eval/node_modules ] || ( cd experiments/agent-eval && npm install --silent --no-audit --no-fund )
	cd experiments/agent-eval && BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem node run.mjs

# Phase-2 wiki gate — the re-derived family live (instantiate + conneg-by-profile).
# Needs up-fork-tls + make cert + `make publish-profiles` (publishes the rep artifacts).
test-wiki:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	@[ -d projection/node_modules ] || ( cd projection && npm ci )
	@[ -d apps/wiki-projector/node_modules ] || ( cd apps/wiki-projector && npm ci )
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-wiki.test.mjs

# Projection unit gates — both the neutral PROF mechanism (projection/) and the
# app-#1 wiki projector (apps/wiki-projector/) suites.
test-projection:
	@[ -d projection/node_modules ] || ( cd projection && npm ci )
	@[ -d apps/wiki-projector/node_modules ] || ( cd apps/wiki-projector && npm ci )
	cd projection && npm test
	cd apps/wiki-projector && npm test

# Publish the profile definitions to the fork TLS pod + bind the demo container.
# Needs `make up-fork-tls` running + `make cert`'s CA. POD_TOKEN via tests helper flow.
publish-profiles:
	@[ -d projection/node_modules ] || ( cd projection && npm ci )
	cd projection && NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem \
	  node publish/publish.mjs --base https://pod.vardeman.me --container /alice/profiles/ \
	  --bind /alice/concepts/=llm-wiki \
	  --bind /alice/datasets/=dcat-catalog --instantiate /alice/datasets/=dcat-catalog --token $${POD_TOKEN}

# Wiki-memory app gate — unit tests (jsdom/node), e2e excluded (Task 10).
test-app:
	cd app && npm install --silent && npx vitest run --exclude '**/e2e.test.mjs'

shell:
	$(COMPOSE) exec jss bash

# --- TLS variant (for the LWS-CID auth experiment; needs an https WebID) ---

# Locally-trusted cert via mkcert (reuses the cogitarelink-solid approach). gitignored.
# Hostname (not localhost): the LWS-CID verifier's SSRF guard blocks loopback when it
# fetches the WebID profile, so we use pod.vardeman.me — already 127.0.0.1 in /etc/hosts
# on the host, and a docker network alias inside the container (resolves to the container IP).
TLS_HOST ?= pod.vardeman.me
cert:
	mkdir -p certs
	mkcert -cert-file certs/pod.crt -key-file certs/pod.key $(TLS_HOST)
	cp "$$(mkcert -CAROOT)/rootCA.pem" certs/rootCA.pem
	@echo "certs/ ready for $(TLS_HOST). Next: make up-tls"

up-tls:
	docker compose -f docker-compose.tls.yml up -d --build
	@echo "JSS (TLS) up at https://localhost:8443"

down-tls:
	docker compose -f docker-compose.tls.yml down

# Headless LWS-CID experiment against the TLS pod (host trusts the mkcert CA).
cid-tls:
	cd experiments/headless-cid && npm install --silent
	NODE_EXTRA_CA_CERTS="$$(mkcert -CAROOT)/rootCA.pem" BASE=https://$(TLS_HOST):8443 node experiments/headless-cid/run.mjs

# --- FORK pod (L1+L2, --lws) behind a TLS-terminating Caddy proxy ---
# Reproduces the PUBLIC Caddy topology the in-JSS-TLS pod can't: http JSS + trustProxy +
# X-Forwarded-Proto, so the storage description's id/serviceEndpoint must come back https
# (the request.protocol scheme fix). Built from a pinned git ref (Dockerfile.fork); own compose
# project (name: lws-pod-forktls) so it never disturbs lws-pod-local. Override JSS_GIT_REF to test
# another branch/SHA. Needs `make cert` (pod.vardeman.me in /etc/hosts -> 127.0.0.1) + host :443 free.
up-fork-tls: cert
	docker compose -f docker-compose.fork-tls.yml up -d --build
	@echo "fork pod (--lws) behind Caddy TLS at https://pod.vardeman.me/  (curl --cacert certs/rootCA.pem)"

down-fork-tls:
	docker compose -f docker-compose.fork-tls.yml down -v

# --- P1 spike: Keycloak in front of JSS (experiments/keycloak-jss) ---
KC = docker compose -f experiments/keycloak-jss/docker-compose.yml

kc-up:
	$(KC) up -d
	@echo "Keycloak (spike) at http://localhost:8080 (realm: lws). Start gateway: cd experiments/keycloak-jss && node gateway.js"

kc-down:
	$(KC) down

# Full spike check: assumes `make up` (JSS) and `make kc-up` (Keycloak) are running.
kc-spike:
	cd experiments/keycloak-jss && npm install --silent && node gateway.js & GW_PID=$$!; sleep 2; cd experiments/keycloak-jss && npx vitest run; RC=$$?; kill $$GW_PID 2>/dev/null || true; exit $$RC
