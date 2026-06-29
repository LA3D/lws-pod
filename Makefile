ENV  ?= local
BASE ?= http://localhost:3838
ENVFILE = .env.$(ENV)
COMPOSE = docker compose --env-file $(ENVFILE) -f docker-compose.yml -f docker-compose.$(ENV).yml

# Subprojects with their own package.json (all carry a lockfile → npm ci is reproducible).
NPM_DIRS = . projection app constrained-container experiments/headless-cid

.PHONY: setup doctor build up down logs reset test test-projection test-app test-app-e2e shell cert up-tls down-tls cid-tls

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

# Projection app gate — pure unit tests + e2e against the running pod (Task 6-8).
test-projection:
	@[ -d projection/node_modules ] || ( cd projection && npm ci )
	cd projection && npm test

# Wiki-memory app gate — unit tests (jsdom/node), e2e excluded (Task 10).
test-app:
	cd app && npm install --silent && npx vitest run --exclude '**/e2e.test.mjs'

# Wiki-memory app e2e gate — requires pod :3838 + proxy :8080 + seeded (Task 10).
test-app-e2e:
	cd app && POD=http://localhost:3838 PROXY=http://localhost:8080 npx vitest run test/e2e.test.mjs

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
