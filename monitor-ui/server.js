const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const execPromise = util.promisify(exec);

const app = express();
app.use(express.json());
app.use(express.static('public'));

const HOST = '10.70.0.118';
const API_URL = `http://${HOST}`;
const SERVICES = [
    { port: 8001, name: 'wa-api-bkk' },
    { port: 8002, name: 'wa-api-bapas' },
    { port: 8004, name: 'wa-api-smartdesaku' },
    { port: 8005, name: 'wa-api-gianyar' },
    { port: 8007, name: 'wa-api-bangli' },
    { port: 8009, name: 'wa-api-boyolali' },
    { port: 8010, name: 'wa-api-purwodadi' }
];

app.post('/api/monitor', async (req, res) => {
    const password = req.body.password;
    const targetNumber = req.body.targetNumber || '0895370034003';
    
    if (!password) {
        return res.status(400).json({ error: 'Password SSH diperlukan' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Test SSH connection
    try {
        sendEvent('status', { message: 'Menguji koneksi SSH...' });
        await execPromise(`sshpass -p "${password}" ssh -p 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=5 userwhatsapp@${HOST} "echo OK"`);
        sendEvent('status', { message: '✅ Login SSH berhasil' });
    } catch (err) {
        sendEvent('error', { message: '❌ Login SSH gagal' });
        return res.end();
    }

    let successCount = 0;
    let failedCount = 0;
    let delayCount = 0;

    for (let i = 0; i < SERVICES.length; i++) {
        const service = SERVICES[i];
        const port = service.port;
        const name = service.name;

        sendEvent('service_start', { name, port, time: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) });

        try {
            // Send test message via curl
            await execPromise(`curl -s -X POST ${API_URL}:${port}/api/wa/whatsapp -H "Content-Type: application/json" -d '{"title":"Test","content":"Tes WA","destination":"${targetNumber}"}'`);
        } catch (err) {
            // ignore curl errors
        }

        let success = 0;
        let errorMsg = '';
        let ackLine = '';

        for (let attempt = 1; attempt <= 3; attempt++) {
            await new Promise(r => setTimeout(r, 3000));

            try {
                const { stdout, stderr } = await execPromise(`sshpass -p "${password}" ssh -p 2222 -o StrictHostKeyChecking=no userwhatsapp@${HOST} "docker logs --tail 100 ${name} 2>/dev/null | tail -n 50"`);
                
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
            } catch (err) {
                // ignore ssh errors on attempt
            }
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

    sendEvent('done', { successCount, failedCount, delayCount, total: SERVICES.length });
    res.end();
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
