# WA API Central Monitor — Digi Transaksi Production

Real-time status monitoring untuk WhatsApp Gateway API

Tujuan:
- Menyediakan monitoring terpadu (central) untuk API gateway WhatsApp.
- Menampilkan status koneksi, antrean pesan, dan metrik real-time.
- Memberi alert sederhana bila service down atau terjadi anomali.

Komponen di repo:
- `monitor-ui/` — UI sederhana (Express + static) untuk tampilan monitoring.
- `next-monitor-ui/` — Next.js app untuk dashboard monitoring real-time.
- `test-boot-wa-prod-digi.sh` — skrip helper/deploy lokal.

Mulai cepat (development):
1. Masuk ke folder `next-monitor-ui` dan jalankan `npm install` lalu `npm run dev`.
2. Untuk UI sederhana, masuk ke `monitor-ui` dan jalankan `npm install` lalu `node server.js`.

Catatan:
- Repo ini sebelumnya belum mengabaikan `node_modules`; sebaiknya jalankan `git rm -r --cached node_modules` lalu commit setelah menambahkan `.gitignore`.
