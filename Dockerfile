# Dockerfile
FROM python:3.11-slim

ENV POETRY_VIRTUALENVS_CREATE=false \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps pour psycopg2 et autres
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Requirements
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Code
COPY server.py /app/server.py

# Dossier pour fichiers uploadés
RUN mkdir -p /app/uploads

ENV DATABASE_URL=postgresql+psycopg2://lp_user:lp_pass@db:5432/lifepath \
    LIFEPATH_DEBUG=0

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
