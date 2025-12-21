build:
	git pull && \
	docker compose down && \
	docker compose up -d --build

log:
	docker compose logs -f
