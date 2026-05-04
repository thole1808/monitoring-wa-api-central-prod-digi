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

Docker build & run
------------------

Build the Docker image (example):

```bash
docker build -t wa-next:latest -f next-monitor-ui/Dockerfile ./next-monitor-ui
```

If you want `.env.local` included in the image build, keep the file in `next-monitor-ui/` before building. The Dockerfile will copy `.env.local` into the build context and use it during `npm run build`.

For runtime SSH access, you still need to pass environment variables into the running container, for example with `--env-file .env.local`.

Run the container (serve on host port 3000):

```bash
docker run --rm -p 3000:3000 \
	-e NODE_ENV=production \
	-v "$PWD/next-monitor-ui/.next:/app/.next" \
	wa-next:latest
```

If you use an `.env.local` file for secrets, do NOT copy it into an image. Provide at runtime:

```bash
docker run --rm -p 3000:3000 \
	--env-file next-monitor-ui/.env.local \
	wa-next:latest
```

Docker Compose (quick example)
------------------------------

Create a `docker-compose.yml` at repository root with this minimal example:

```yaml
version: '3.8'
services:
	wa-next:
		build:
			context: ./next-monitor-ui
			dockerfile: Dockerfile
		image: wa-next:latest
		ports:
			- "3000:3000"
		environment:
			- NODE_ENV=production
		restart: unless-stopped
```

Then run:

```bash
docker-compose up -d --build
```

Notes & Best Practices
----------------------

- The `next-monitor-ui/Dockerfile` is a multi-stage build (build + runner). It expects `npm run build` to produce a production Next.js output.
- Keep secrets out of images; prefer `--env-file`, Docker secrets, or a runtime secret manager.
- If you want automatic HTTPS or reverse-proxy features, run behind Nginx/Traefik or deploy to a platform that provides TLS (Vercel, Fly, etc.).
- If you need, I can add a `docker-compose.yml` that runs both `monitor-ui` and `next-monitor-ui`, or add a healthcheck and non-root user to the Dockerfile.

Resources
---------

- Next.js docs: https://nextjs.org/docs
- Docker docs: https://docs.docker.com/

