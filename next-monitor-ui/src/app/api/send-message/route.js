import { exec } from 'child_process';
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

export async function POST(req) {
    try {
        const body = await req.json();
        const { targetNumber, content, senderPort } = body;

        if (!targetNumber || !content || !senderPort) {
            return Response.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const encryptedPassword = process.env.ENCRYPTED_SSH_PASSWORD;
        const encryptionKey = process.env.ENCRYPTION_KEY;
        const host = process.env.TARGET_HOST || '10.70.0.118';

        const password = decryptPassword(encryptedPassword, encryptionKey);
        if (!password) {
            return Response.json({ error: 'Auth failed' }, { status: 500 });
        }

        // Format message for WhatsApp
        const payload = JSON.stringify({
            title: "QR_AUTH_REQUEST",
            content: content,
            destination: targetNumber
        });

        // Use curl via SSH or direct if possible. Here we use the same pattern as monitor.
        const command = `curl -s -X POST http://localhost:${senderPort}/api/wa/whatsapp -H "Content-Type: application/json" -d '${payload}'`;
        
        await execPromise(`sshpass -e ssh -p 2222 -o StrictHostKeyChecking=no userwhatsapp@${host} "${command}"`, {
            env: { ...process.env, SSHPASS: password, HOME: '/tmp' }
        });

        return Response.json({ success: true, message: 'QR sent successfully' });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
