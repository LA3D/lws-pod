BASE ?= http://localhost:3838

.PHONY: build up down logs reset smoke shell cert up-tls down-tls cid-tls

build:
	docker compose build

up:
	docker compose up -d
	@echo "JSS up at $(BASE)  (logs: make logs)"

down:
	docker compose down

logs:
	docker compose logs -f

# Fresh volume — wipes all pod data, rebuilds, restarts.
reset:
	docker compose down -v
	docker compose up -d --build
	@echo "JSS reset + up at $(BASE)"

# First-pass evaluation: boot -> create pod -> headless token -> write/read -> MCP -> git clone.
smoke:
	BASE=$(BASE) ./smoke.sh

shell:
	docker compose exec lws-pod bash

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
