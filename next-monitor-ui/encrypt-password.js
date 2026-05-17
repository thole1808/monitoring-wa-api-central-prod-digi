const crypto = require('crypto');

// 1. Ganti 'PASSWORD_ANDA_DISINI' dengan password SSH asli Anda.
const passwordAsli = '';

// 2. Tentukan kunci rahasia (bisa apa saja, disarankan panjang & unik)
const encryptionKey = 'super_secret_key_12345';

function encryptPassword(text, secretKey) {
    const iv = crypto.randomBytes(16);
    // Ensure key is 32 bytes
    const key = crypto.createHash('sha256').update(String(secretKey)).digest('base64').substring(0, 32);

    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

const encryptedPassword = encryptPassword(passwordAsli, encryptionKey);

console.log('====================================================');
console.log('BERIKUT ADALAH KONFIGURASI UNTUK .env.local ANDA:');
console.log('====================================================\n');
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log(`ENCRYPTED_SSH_PASSWORD=${encryptedPassword}`);
console.log(`TARGET_HOST=10.70.0.118\n`);
console.log('====================================================');
console.log('Silakan buat file bernama .env.local di dalam folder next-monitor-ui');
console.log('dan copy-paste dua baris di atas ke dalamnya.');
