import { exec, spawn } from 'child_process';
import util from 'util';
import crypto from 'crypto';

const execPromise = util.promisify(exec);

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

const SSH_OPTIONS = '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o GlobalKnownHostsFile=/dev/null -o LogLevel=ERROR';

export async function POST(req) {
    const body = await req.json();
    const { action, serviceName, port } = body;

    const encryptedPassword = process.env.ENCRYPTED_SSH_PASSWORD;
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const host = process.env.TARGET_HOST || '10.70.0.118';

    if (!encryptedPassword || !encryptionKey) {
        return Response.json({ error: 'Config missing' }, { status: 500 });
    }

    const password = decryptPassword(encryptedPassword, encryptionKey);
    if (!password) {
        return Response.json({ error: 'Decrypt failed' }, { status: 500 });
    }

    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
        async start(controller) {
            const sendEvent = (event, data) => {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            let command = '';
            
            const suffix = serviceName.split('-').pop();
            const folderName = `notification-wa-service-${suffix}`;
            const baseDir = `/home/userwhatsapp/${folderName}`;

            switch (action) {
                case 'stop':
                    command = `docker stop ${serviceName}`;
                    break;
                case 'rm':
                    command = `docker rm ${serviceName}`;
                    break;
                case 'reset_db':
                    command = `cd ${baseDir} && rm -rf wasopingi.db && go get go.mau.fi/whatsmeow`;
                    break;
                case 'build':
                    command = `cd ${baseDir} && docker build --rm -t ${serviceName}:alpha .`;
                    break;
                case 'run':
                    // Run container and then tail logs for a few seconds to catch QR code
                    command = `docker run -d --name ${serviceName} --restart always -p ${port}:${port} ${serviceName}:alpha && sleep 2 && docker logs --tail 20 -f ${serviceName} & sleep 15; kill $!`;
                    break;
                case 'get_logs':
                    command = `docker logs --tail 1000 ${serviceName}`;
                    break;
                default:
                    sendEvent('error', { message: 'Unknown action' });
                    controller.close();
                    return;
            }

            sendEvent('status', { message: `Running: ${command}` });

            const child = spawn('sshpass', [
                '-e',
                'ssh',
                '-p',
                '2222',
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'UserKnownHostsFile=/dev/null',
                `userwhatsapp@${host}`,
                command
            ], {
                env: { ...process.env, SSHPASS: password, HOME: '/tmp' }
            });

            let fullOutput = '';
            child.stdout.on('data', (data) => {
                const msg = data.toString();
                fullOutput += msg;
                sendEvent('log', { message: msg });
            });

            child.stderr.on('data', (data) => {
                const msg = data.toString();
                fullOutput += msg;
                sendEvent('log', { message: msg, isError: true });
            });

            child.on('close', (code) => {
                const isConflict = action === 'run' && (fullOutput.toLowerCase().includes('conflict') || fullOutput.toLowerCase().includes('already in use'));
                sendEvent('done', { 
                    code, 
                    message: code === 0 ? 'Success' : `Failed with code ${code}`,
                    isConflict
                });
                controller.close();
            });
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
