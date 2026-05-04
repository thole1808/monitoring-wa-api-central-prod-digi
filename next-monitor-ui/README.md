WA API Central Monitor — Digi Transaksi Production

Real-time status monitoring untuk WhatsApp Gateway API.

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

Notes
-----

- This dashboard is intended to consume monitoring endpoints (SSE/WebSocket/REST) from the WA Gateway or a collector service.
- Customize `src/app/api/monitor/route.js` to point to your monitoring source or proxy.
- Consider deploying on Vercel or any Node-friendly host for production dashboards.

Resources
---------

- Next.js docs: https://nextjs.org/docs
- For production, ensure environment variables and secrets are provided securely.
