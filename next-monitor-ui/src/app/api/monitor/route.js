import { exec } from 'child_process';
import util from 'util';
import crypto from 'crypto';

const execPromise = util.promisify(exec);

// Helper function to decrypt password
function decryptPassword(encryptedText, secretKey) {
    try {
        const textParts = encryptedText.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedData = Buffer.from(textParts.join(':'), 'hex');
        // Ensure key is 32 bytes
        const key = crypto.createHash('sha256').update(String(secretKey)).digest('base64').substring(0, 32);
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return null;
    }
}

const SERVICES = [
    { port: 8001, name: 'wa-api-bkk' },
    { port: 8002, name: 'wa-api-bapas' },
    { port: 8004, name: 'wa-api-smartdesaku' },
    { port: 8005, name: 'wa-api-gianyar' },
    { port: 8007, name: 'wa-api-bangli' },
    { port: 8009, name: 'wa-api-boyolali' },
    { port: 8010, name: 'wa-api-purwodadi' }
];

export async function GET() {
    return Response.json({
        status: 'ready',
        message: 'Monitor API ready. Scan hanya berjalan dari tombol Start Scan.',
        services: SERVICES.map(({ port, name }) => ({ port, name }))
    });
}

export async function POST(req) {
    const body = await req.json();
    const targetNumber = body.targetNumber || '0895370034003';
    const servicePort = body.servicePort ? parseInt(body.servicePort, 10) : null;

    // Ambil encrypted password & key dari .env
    const encryptedPassword = process.env.ENCRYPTED_SSH_PASSWORD;
    const encryptionKey = process.env.ENCRYPTION_KEY;

    if (!encryptedPassword || !encryptionKey) {
        return new Response(JSON.stringify({ error: 'Konfigurasi ENCRYPTED_SSH_PASSWORD atau ENCRYPTION_KEY di server tidak ditemukan.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const password = decryptPassword(encryptedPassword, encryptionKey);
    
    if (!password) {
        return new Response(JSON.stringify({ error: 'Gagal mendeskripsi password SSH di server.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
        async start(controller) {
            const sendEvent = (event, data) => {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            // Dynamic Host loading
            const HOST = process.env.TARGET_HOST || '10.70.0.118';
            const API_URL = `http://${HOST}`;
            
            // Env config for sshpass
            const execOptions = {
                env: { ...process.env, SSHPASS: password }
            };

            // Test SSH connection
            try {
                sendEvent('status', { message: 'Menguji koneksi SSH...' });
                await execPromise(`sshpass -e ssh -p 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=5 userwhatsapp@${HOST} "echo OK"`, execOptions);
                sendEvent('status', { message: '✅ Login SSH berhasil' });
            } catch (err) {
                sendEvent('error', { message: '❌ Login SSH gagal' });
                controller.close();
                return;
            }

            let successCount = 0;
            let failedCount = 0;
            let delayCount = 0;

            const targetServices = servicePort ? SERVICES.filter(s => s.port === servicePort) : SERVICES;

            for (let i = 0; i < targetServices.length; i++) {
                const service = targetServices[i];
                const port = service.port;
                const name = service.name;

                sendEvent('service_start', { name, port, time: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) });

                try {
                    await execPromise(`curl -s -X POST ${API_URL}:${port}/api/wa/whatsapp -H "Content-Type: application/json" -d '{"title":"Test","content":"Tes WA","destination":"${targetNumber}"}'`);
                } catch (err) {}

                let success = 0;
                let errorMsg = '';
                let ackLine = '';

                for (let attempt = 1; attempt <= 3; attempt++) {
                    await new Promise(r => setTimeout(r, 3000));

                    try {
                        const { stdout } = await execPromise(`sshpass -e ssh -p 2222 -o StrictHostKeyChecking=no userwhatsapp@${HOST} "docker logs --tail 100 ${name} 2>/dev/null | tail -n 50"`, execOptions);
                        
                        const lines = stdout.split('\\n');
                        for (const line of lines) {
                            if (line.includes('<ack class="message"')) {
                                ackLine = line;
                                success = 1;
                            }
                            if (line.match(/error|EOF|websocket|refused/i)) {
                                errorMsg = line;
                            }
                        }

                        if (success === 1) break;
                    } catch (err) {}
                }

                if (success === 1) {
                    successCount++;
                    sendEvent('service_result', { name, port, status: 'SUCCESS', message: 'TERKIRIM', detail: ackLine, time: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) });
                } else if (errorMsg) {
                    failedCount++;
                    sendEvent('service_result', { name, port, status: 'FAILED', message: 'GAGAL', detail: errorMsg });
                } else {
                    delayCount++;
                    sendEvent('service_result', { name, port, status: 'DELAY', message: 'DELAY / PROSES', detail: 'Tidak ada ACK atau error' });
                }
            }

            sendEvent('done', { successCount, failedCount, delayCount, total: targetServices.length });
            controller.close();
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
