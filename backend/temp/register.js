const srp = require('secure-remote-password/client');
const crypto = require('crypto');

// Benutzername und Passwort
const username = 'testuser';
const password = 'geheimesPasswort';

// Salt generieren
const salt = crypto.randomBytes(16).toString('hex');

// SRP-Client initialisieren
const client = new srp.Client();
client.init(password);

// Verifikator berechnen
const verifier = client.computeVerifier(salt);

// Daten senden
fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, salt, verifier }),
});
