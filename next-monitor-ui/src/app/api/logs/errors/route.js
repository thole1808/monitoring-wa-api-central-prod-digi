import { spawn } from 'child_process';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVICES = [
    { port: 8001, name: 'wa-api-bkk' },
    { port: 8002, name: 'wa-api-bapas' },
    { port: 8004, name: 'wa-api-smartdesaku' },
    { port: 8005, name: 'wa-api-gianyar' },
    { port: 8007, name: 'wa-api-bangli' },
    { port: 8009, name: 'wa-api-boyolali' },
    { port: 8010, name: 'wa-api-purwodadi' }
];

const SSH_OPTIONS = [
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'GlobalKnownHostsFile=/dev/null',
    '-o',
    'LogLevel=ERROR',
    '-o',
    'ServerAliveInterval=15'
];

function decryptPassword(encryptedText, secretKey) {
    try {
        const textParts = encryptedText.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedData = Buffer.from(textParts.join(':'), 'hex');
        const key = crypto.createHash('sha256').update(String(secretKey)).digest('base64').substring(0, 32);

        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return null;
    }
}

export async function GET() {
    const encryptedPassword = process.env.ENCRYPTED_SSH_PASSWORD;
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const host = process.env.TARGET_HOST || '10.70.0.118';

    if (!encryptedPassword || !encryptionKey) {
        return Response.json({ error: 'Konfigurasi ENCRYPTED_SSH_PASSWORD atau ENCRYPTION_KEY tidak ditemukan.' }, { status: 500 });
    }

    const password = decryptPassword(encryptedPassword, encryptionKey);

    if (!password) {
        return Response.json({ error: 'Gagal mendeskripsi password SSH.' }, { status: 500 });
    }

    const encoder = new TextEncoder();
    const children = [];

    const stream = new ReadableStream({
        start(controller) {
            const sendEvent = (event, data) => {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            sendEvent('status', {
                message: 'Realtime error log connected. Tidak menjalankan scan WhatsApp.',
                services: SERVICES.length
            });

            for (const service of SERVICES) {
                const remoteCommand = `docker logs -f --tail 50 ${service.name} 2>&1 | egrep -i --line-buffered "error"`;
                const child = spawn('sshpass', [
                    '-e',
                    'ssh',
                    '-p',
                    '2222',
                    ...SSH_OPTIONS,
                    `userwhatsapp@${host}`,
                    remoteCommand
                ], {
                    env: { ...process.env, SSHPASS: password, HOME: '/tmp' },
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                children.push(child);
                sendEvent('service_connected', service);

                let stdoutBuffer = '';
                child.stdout.on('data', chunk => {
                    stdoutBuffer += chunk.toString();
                    const lines = stdoutBuffer.split('\n');
                    stdoutBuffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        sendEvent('error_log', {
                            ...service,
                            line: trimmed,
                            time: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
                        });
                    }
                });

                child.stderr.on('data', chunk => {
                    const message = chunk.toString().trim();
                    if (!message) return;
                    if (/known hosts|permanently added|could not create directory/i.test(message)) return;
                    sendEvent('stream_error', { ...service, message });
                });

                child.on('close', code => {
                    sendEvent('service_closed', { ...service, code });
                });
            }
        },
        cancel() {
            for (const child of children) {
                if (!child.killed) child.kill('SIGTERM');
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive'
        }
    });
}
