FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Pinned runtime dependencies first (cached layer), then the app itself without re-resolving.
COPY requirements.lock ./
RUN pip install -r requirements.lock
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-deps .

COPY alembic.ini ./
COPY migrations ./migrations

RUN useradd --system --uid 10001 app && mkdir -p /app/var/storage && chown -R app /app/var
USER app
EXPOSE 8000
ENV FORWARDED_ALLOW_IPS=127.0.0.1
# Migrations are an explicit separate step: `docker compose run --rm api alembic upgrade head`.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips \"$FORWARDED_ALLOW_IPS\""]
