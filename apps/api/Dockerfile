FROM python:3.11-slim

WORKDIR /app

# Install git for repository operations
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy source code
COPY src/ src/

# Create necessary directories
RUN mkdir -p /app/workspaces /app/data

# Set environment variables
ENV PYTHONPATH=/app/src
ENV DURSOR_BASE_DIR=/app
ENV DURSOR_WORKSPACES_DIR=/app/workspaces
ENV DURSOR_DATA_DIR=/app/data

EXPOSE 8000

CMD ["uvicorn", "dursor_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
