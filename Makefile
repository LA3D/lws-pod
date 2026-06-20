BASE ?= http://localhost:3838

.PHONY: build up down logs reset smoke shell

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
