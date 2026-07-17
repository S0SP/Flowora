# Production Deployment Guide: Headless, Multi-Tenant Dograh Voice Agent

This guide outlines the production deployment steps, environment configurations, and architectural parameters required to deploy the unified Flowra and Dograh setup.

---

## 1. Environment Configurations

Both servers need specific environment variables configured to authenticate and communicate securely.

### Flowra Backend `.env`
Add the following parameters to Flowra's Next.js backend environment:

```env
# Dograh API base URL (private endpoint)
DOGRAH_API_URL=http://<dograh-internal-ip-or-domain>:8000

# Private backend-to-backend authentication secret
DOGRAH_SECRET=change-me-in-production

# Mapped template Workflow ID configured in Dograh
DOGRAH_WORKFLOW_ID=1
```

### Dograh Backend `.env`
Create or modify the `.env` file in the root of the `dograh` directory on the remote server:

```env
# Flowra Backend origin URL
FLOWRA_API_URL=https://your-flowra-domain.com

# Private backend-to-backend authentication secret (Must match Flowra's DOGRAH_SECRET)
FLOWRA_SECRET=change-me-in-production

# Dograh Core settings
ENVIRONMENT=production
PUBLIC_HOST=dograh.your-domain.com
PUBLIC_BASE_URL=https://dograh.your-domain.com
FASTAPI_WORKERS=4  # Set higher for multi-core scale
OSS_JWT_SECRET=strong-random-jwt-signing-secret

# Supplying external credentials (example)
# GEMINI_API_KEY is supplied globally inside Flowra; Dograh forwards RAG queries to Flowra.
```

---

## 2. Deploying Dograh (Remote Linux Host)

Because we modified the python backend code to support bypass auth (`X-Flowra-Secret`) and remote RAG routing (`/api/voice/knowledge-base`), we **must compile the custom Docker image** on build.

### Step 1: Transfer/Clone the Dograh Repository
Copy the modified `dograh` folder from your development machine to your production Linux VPS/server.

### Step 2: Initialize System Services
Run the remote initialization script. This script automatically checks for Docker dependencies, renders SSL certificates, and configures the nginx/coturn profiles:
```bash
chmod +x setup_remote.sh remote_up.sh
sudo ./setup_remote.sh
```

### Step 3: Populate environment secrets
Edit the generated `.env` file in the `dograh` directory and ensure the configuration keys (`FLOWRA_API_URL`, `FLOWRA_SECRET`, `OSS_JWT_SECRET`) are correctly set.

### Step 4: Build and Launch the Stack
Run the startup script with the `--build` parameter. This forces Docker Compose to build the local `./api` Dockerfile:
```bash
./remote_up.sh --build
```
This starts:
- **`postgres`** (pgvector engine)
- **`redis`** (lock coordination)
- **`minio`** (private file/audio storage)
- **`api`** (Custom uvicorn FastAPI server running our modified codebase)
- **`nginx`** (Reverse proxy forwarding HTTPS and WebSocket `wss://` requests)
- **`coturn`** (NAT Traversal server for WebRTC media streams)

---

## 3. Telephony Mapping (VoiceLink Configuration)

Since Dograh runs headlessly for clients, you (as the admin) manually map telephony credentials in the private Dograh panel:

1. Log into your private Dograh dashboard at `https://dograh.your-domain.com` (using the admin credentials generated on startup).
2. Go to **Configurations** > **Telephony Configurations**.
3. Create a new configuration with provider **VoiceLink**.
4. Enter the client's VoiceLink API credentials (trunk IDs, usernames/passwords).
5. Copy the generated webhook callback URL (e.g., `wss://dograh.your-domain.com/api/v1/telephony/ws/voicelink`).
6. Paste this WSS URL inside the client's VoiceLink trunk setup to route incoming/outgoing streams.
7. Note down the **Telephony Configuration ID** (e.g. `1` or `2`) and save it in your admin panel if you want to route distinct clients to distinct trunk lines.

---

## 4. Scalability and Concurrency

Dograh uses an async event loop mapping audio buffers to Pipecat pipelines, making it extremely lightweight.

* **Single Worker Instance**: Can comfortably stream **30-50 concurrent calls** on a standard 2 VCPU / 4GB RAM server.
* **Vertical Scaling**: Increase `FASTAPI_WORKERS` inside `.env` to match the CPU count of your server. Each worker runs on an isolated CPU core.
* **Horizontal Scaling**: Launch multiple replica instances of the `api` container behind a load balancer. Ensure they all point to the same shared Redis instance to maintain global concurrency locks.
