FROM python:3.11-slim

WORKDIR /workspace

# Install system dependencies if any
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files and the physical api/backend/app directory for symlink resolution
COPY api/backend/app /workspace/api/backend/app
COPY backend /workspace/backend

ENV PYTHONPATH=/workspace

EXPOSE 8000

# Start app
CMD uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
