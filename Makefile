.PHONY: up down migrate seed test eval logs shell-api shell-worker psql fmt lint clean

up:
	docker compose up --build

down:
	docker compose down

migrate:
	docker compose exec api python -m alembic -c alembic/alembic.ini upgrade head

seed:
	docker compose exec api python /app/scripts/seed.py

test:
	docker compose exec api python -m pytest backend/tests/ -v --tb=short
	cd frontend && npm run test -- --run

eval:
	docker compose exec api python /app/scripts/eval_models.py

logs:
	docker compose logs -f

shell-api:
	docker compose exec api /bin/bash

shell-worker:
	docker compose exec worker /bin/bash

psql:
	docker compose exec db psql -U postgres -d altur

fmt:
	docker compose exec api python -m ruff format backend/
	cd frontend && npx prettier --write src/

lint:
	docker compose exec api python -m ruff check backend/
	cd frontend && npx tsc --noEmit

clean:
	docker compose down -v --remove-orphans
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
