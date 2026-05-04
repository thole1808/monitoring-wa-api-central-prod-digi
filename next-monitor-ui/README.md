WA Central — Digi Transaksi

Status real-time WhatsApp Gateway

Purpose
-------

- Display connection health, queue lengths, throughput, and basic error/alerting indicators.

Getting started (development)
-----------------------------

1. Install dependencies and run the dev server:

```bash
cd next-monitor-ui
npm install
npm run dev
```

2. Open http://localhost:3000 to view the dashboard.

Production build (local)
------------------------

Build and run locally (production mode):

```bash
cd next-monitor-ui
npm install
npm run build
npm start
```

Docker Setup & Deployment
--------------------------

### Prerequisites

- Docker (version 20.10+)
- `.env.local` file in the `next-monitor-ui` directory with:
  - `ENCRYPTION_KEY` — secret key for password decryption
  - `ENCRYPTED_SSH_PASSWORD` — encrypted SSH password (use `encrypt-password.js` to generate)
  - `TARGET_HOST` — SSH target host (e.g., `10.70.0.118`)

### Step 1: Build the Docker Image

From the repository root:

```bash
docker build -t wa-next:latest -f next-monitor-ui/Dockerfile ./next-monitor-ui
```

**What happens:**
- Multi-stage build: first stage compiles Next.js, second stage runs the app
- Copies `.env.local` from `next-monitor-ui/` during build (if present)
- Installs runtime dependencies: `openssh`, `sshpass`, `curl` (required for SSH connectivity and health checks)
- Build output: production-ready image with Node.js 20 Alpine

### Step 2: Run the Container

#### Option A: Direct `docker run` (recommended for testing)

```bash
docker run -d \
  --name wa-next \
  -p 3000:3000 \
  --env-file ./next-monitor-ui/.env.local \
  --restart unless-stopped \
  wa-next:latest
```

#### Option B: With custom port (if 3000 is in use)

```bash
docker run -d \
  --name wa-next \
  -p 3001:3000 \
  --env-file ./next-monitor-ui/.env.local \
  --restart unless-stopped \
  wa-next:latest
```

Then access the app at `http://localhost:3001`.

### Step 3: Verify the Container is Running

```bash
docker ps -a --filter "name=wa-next"
```

Expected output (shows `healthy` status after ~30 seconds):

```
CONTAINER ID   NAMES     STATUS                 PORTS
abc123...      wa-next   Up 2 minutes (healthy) 0.0.0.0:3000->3000/tcp
```

### Step 4: Check Logs

```bash
docker logs -f wa-next
```

Expected:
```
▲ Next.js 16.2.4
- Local:         http://localhost:3000
- Network:       http://172.17.0.2:3000
✓ Ready in 650ms
```

### Access the App

Open your browser and navigate to:

```
http://localhost:3000
```

You should see:
- 7 WhatsApp API service cards
- Real-time status monitoring dashboard
- Service test buttons
- Live logs from `docker logs` commands via SSH

---

Docker Compose (optional)
-------------------------

Create a `docker-compose.yml` at repository root:

```yaml
version: '3.8'
services:
  wa-next:
    build:
      context: ./next-monitor-ui
      dockerfile: Dockerfile
    image: wa-next:latest
    container_name: wa-next
    ports:
      - "3000:3000"
    env_file:
      - ./next-monitor-ui/.env.local
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Then deploy with:

```bash
docker-compose up -d
```

---

Troubleshooting
---------------

**Container stops immediately:**
- Check logs: `docker logs wa-next`
- Verify `.env.local` exists and is readable: `ls -la ./next-monitor-ui/.env.local`
- Ensure `ENCRYPTION_KEY` and `ENCRYPTED_SSH_PASSWORD` are set

**SSH connection fails in realtime monitoring:**
- Confirm `sshpass` is installed in the container: `docker exec wa-next which sshpass`
- Verify SSH credentials in `.env.local` are correct
- Test SSH manually: `docker exec wa-next sshpass -e ssh -p 2222 -o StrictHostKeyChecking=no userwhatsapp@10.70.0.118 "echo OK"`

**Port 3000 already in use:**
- Use alternate port: `-p 3001:3000` in `docker run`
- Or stop conflicting container: `docker ps` and `docker stop <container_id>`

**Container marked as `unhealthy`:**
- Wait 30+ seconds for startup
- Check logs: `docker logs wa-next`
- Ensure app started successfully (look for "Ready in Xms")

---

Best Practices
--------------

- **Secrets Management:** Keep `.env.local` out of Git (add to `.gitignore`). Provide at runtime via `--env-file`.
- **Restart Policy:** Use `--restart unless-stopped` for automatic recovery.
- **Logging:** Monitor with `docker logs -f wa-next` during development.
- **Resource Limits:** Add `--memory 512m --cpus 0.5` if needed for production.
- **SSL/TLS:** For production, run behind Nginx or Traefik with reverse proxy.

Resources
---------

- Next.js docs: https://nextjs.org/docs
- Docker docs: https://docs.docker.com/
- Docker Compose docs: https://docs.docker.com/compose/

