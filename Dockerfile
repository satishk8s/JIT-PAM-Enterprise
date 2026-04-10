FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production \
    FRONTEND_DIR=/app/frontend \
    PORT=5000

WORKDIR /app/backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    pkg-config \
    libxml2-dev \
    libxmlsec1-dev \
    libxmlsec1-openssl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/requirements.txt
RUN python -m pip install --no-cache-dir --upgrade "pip>=25.3" \
    && python -m pip install --no-cache-dir -r /tmp/requirements.txt

COPY backend /app/backend
COPY frontend /app/frontend

RUN groupadd --gid 1000 npamx \
    && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin npamx \
    && mkdir -p /app/backend/data \
    && chown -R npamx:npamx /app

USER npamx

EXPOSE 5000
EXPOSE 8001

CMD ["python", "start_servers.py"]
