FROM python:3.12-slim AS base
WORKDIR /app
RUN pip install uv
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ .
ENV PYTHONPATH=/app
CMD ["celery", "-A", "app.celery_app", "worker", "--loglevel=info", "--concurrency=4"]
