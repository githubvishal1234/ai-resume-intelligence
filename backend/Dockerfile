FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Microsoft ODBC Driver 18, which pyodbc uses to reach SQL Server.
RUN apt-get update  && apt-get install -y --no-install-recommends curl gnupg ca-certificates  && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc     | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg  && . /etc/os-release  && curl -fsSL "https://packages.microsoft.com/config/debian/${VERSION_ID}/prod.list"     > /etc/apt/sources.list.d/mssql-release.list  && apt-get update  && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 unixodbc  && apt-get purge -y curl gnupg && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

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
