// Script to generate Chrome extension key
// Run with: node scripts/generate-key.js

const crypto = require('crypto');

// Generate a new RSA key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'der'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Convert public key to base64 (this is what goes in manifest.json "key" field)
const base64PublicKey = publicKey.toString('base64');

// Calculate the extension ID from the public key
const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
const extensionId = hash.substring(0, 32).split('').map(c => {
  const num = parseInt(c, 16);
  return String.fromCharCode('a'.charCodeAt(0) + num);
}).join('');

console.log('=== Chrome Extension Key Generator ===\n');
console.log('Add this "key" field to your manifest.json:\n');
console.log(`"key": "${base64PublicKey}",\n`);
console.log('This will give your extension the ID:', extensionId);
console.log('\n=== Private Key (save this securely) ===\n');
console.log(privateKey);
