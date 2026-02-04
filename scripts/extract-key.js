import crypto from 'crypto';

const privateKeyPem = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDEwKR4nejopsID
AEX8Ql0PaM6zTME6jYOEydaqBalPP9eiDndxiwv8j1En2ApZjXoYqirld71WLIrU
IhyTRSXMEqrvrg4Ma5L4PBT4FhUblMO0De0CwtWvzPnDkE6i7sxdlVcE8YCxh9YW
AG1EKsfmICKZUXy36Z1WmWCM9vTO0cgu4nCvPCOetMCmJAiOVP+gWzemK+8EBdvk
T0GC/fM5o2egmprDPTdkLVyLafpySlDeQpTgIVzXHaKrrG0uGmKJc5ODyAMJ+nGH
bOST5yomUh5509DJSFT6I/HNLrQu9cIHKihVgaAgRi57ZRWLr7ivlpWw4ji26mk+
gNVvwgKrAgMBAAECggEAGTx0XBw1AZJSFDx2vZJtiUpyKMFRj4cTNXcGF6y+OLIB
oIGmhGPHV8+yIyAsw6vH214IPoKLQIBaFjeB3snhvTkvv6pdlu49XaWnMuLyNiVw
rKmUmuQOsIvkBVd/Hpruj5pWHQY08ZBwv0WyvimWlkfM6Elxa82FJtRpc+tBHz3D
cJ4tPP4C3OCql+Ui5c6VeW9K5DQBKkDuTSPQjvUxNXOikaHhMuJPZ+DYjuL1N3XJ
XwNBoa6qgGoXVhdAVd7UCaPCT1B+H25Stl1a+CcVzld3GStQ3KlXmv/6gMulvEvP
dQG7WdGRNC430XvaZkEw8fgR4daG0g8GnAaPAtWxcQKBgQDwOeH/99eKfm2WyyE/
Qn9wDlAlK5ujzCT+Fa3I5FcwQMXX8BmdvFpBc0LyqeS55UEkaax6m2xUBZJhsV5X
6xAOrQe6lKnMl94o9IYH2lG1vHsIaM+Jjv1ZkBX0o4vh44enX5vNH7mG2quWg6Hp
PtpUSevYJPJp4SWc44D0x7pInQKBgQDRq/vQy4QIEzJo4QyRiS9sXVVulp2HwPs5
G36ExynVGnYjLBMFxkb22VYWUnXWzOYQmIDi/tXrbXPfVdVJq5XfY5WSTtei7UEw
nZ6lAh/m4PBw++38ERy+frcl4xlVfnxNq9gqvYUBxMyZj38UmnGl1r5rI8Um1J28
PlY2+5Nh5wKBgDXbdEyz3xIAuEcXcXPCT9nqi5NZzIITkbOZXqXsc5Ow4epAvS18
/eswkTDgYBRBTrKAMpgmYkoQGbpnTpR9cdMofdQZ4lupLLiX4bi+/JS3FgpTnTvk
3+4FfLalOAZDwbUHnWGGnEycl92d0138pmxBSmviFKsiPBGJe+7lHGGNAoGAKuFM
Z6AniWs7pP1Zj64Jt9TCsxI0d139Qumfj1IX+RAnVvwdi9HIE5XRKFGG7f4LkxtN
SJ8rarGAwA0SyLVBumToYvqi2RxCd8nUdxSfJ52bLtAnFKT/RuotVJ9EQBrVGyFo
3RzTRdBUs5cIO1N2qJ7pZIn1OQLEm4n4IdiDhMMCgYAVXsKQEU+yJBYrhqb4cKy7
mEZm7z58Spgg44w9xjXg4w24hBSePQsGYXeQMwRxePcW4MBgFF9bFsN4Vlo3g6Jr
jp0MYceqbALEfopJ2WQlhtDtBaQhqwnmEBv/Zab5oGzVrwqUwLFzogCR55jCSHCy
dO/xCVad+yvPeZDPe5BKGg==
-----END PRIVATE KEY-----`;

// Create private key object from PEM
const privateKey = crypto.createPrivateKey(privateKeyPem);

// Create public key from private key
const publicKey = crypto.createPublicKey(privateKey);

// Export public key in DER format (SPKI)
const publicKeyDer = publicKey.export({
  type: 'spki',
  format: 'der'
});

// Convert to base64 for manifest.json
const base64PublicKey = publicKeyDer.toString('base64');

// Calculate extension ID to verify
const hash = crypto.createHash('sha256').update(publicKeyDer).digest('hex');
const extensionId = hash.substring(0, 32).split('').map(c => {
  const num = parseInt(c, 16);
  return String.fromCharCode('a'.charCodeAt(0) + num);
}).join('');

console.log('=== Public Key for manifest.json ===\n');
console.log(`"key": "${base64PublicKey}",`);
console.log('\n=== This will produce Extension ID ===');
console.log(extensionId);
