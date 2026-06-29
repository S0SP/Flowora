FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY voice-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY voice-worker/ .

# Run the agent
CMD ["python", "agent.py", "start"]
