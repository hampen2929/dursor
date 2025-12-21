# Docker commands
build:
	git pull && \
	docker compose down && \
	docker compose up -d --build

log:
	docker compose logs -f

# Local development - install dependencies
install-api:
	cd apps/api && pip install -e ".[dev]"

install-web:
	cd apps/web && npm install

install: install-api install-web

# Local development - run servers
dev-api:
	cd apps/api && python -m dursor_api.main

dev-web:
	cd apps/web && npm run dev

# Run both API and Web servers in parallel
dev:
	@echo "Starting API and Web servers..."
	@trap 'kill 0' EXIT; \
	(cd apps/api && python -m dursor_api.main) & \
	(cd apps/web && npm run dev)
