ENV  ?= local
BASE ?= http://localhost:3838
COMPOSE = docker compose --env-file .env.$(ENV) -f docker-compose.yml -f docker-compose.$(ENV).yml

.PHONY: build up down logs reset test shell cert up-tls down-tls cid-tls

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d --build
	@echo "JSS ($(ENV)) up at $(BASE)  (logs: make logs)"

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

# Fresh pod: stop, wipe the bind-mounted ./data, rebuild, restart.
# (On Linux, ./data may be root-owned by the container — use sudo if rm fails.)
reset:
	$(COMPOSE) down
	rm -rf ./data
	$(COMPOSE) up -d --build
	@echo "JSS ($(ENV)) reset + up at $(BASE)"

# The local verification gate — Vitest e2e against the running pod (Task 2-3).
test:
	BASE=$(BASE) npm test

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
