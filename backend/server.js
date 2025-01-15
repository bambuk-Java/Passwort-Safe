const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs-extra');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

const dbPath = path.join(__dirname, 'data.json');
const PORT = 8080;

let publicKey = '';
let privateKey = '';
let frontendPublicKey = '';

// <--------- RSA Key Management --------->

function generateRSAKeys() {
    const { publicKey: pubKey, privateKey: privKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    publicKey = pubKey;
    privateKey = privKey;

    fs.writeFileSync('publicKey.pem', publicKey);
    fs.writeFileSync('privateKey.pem', privateKey);
}

function readRSAKeys() {
    if (fs.existsSync('publicKey.pem') && fs.existsSync('privateKey.pem')) {
        publicKey = fs.readFileSync('publicKey.pem', 'utf8');
        privateKey = fs.readFileSync('privateKey.pem', 'utf8');
    } else {
        generateRSAKeys();
    }
}

function decryptAndVerify({ encryptedData, signature }) {
    if (!frontendPublicKey) {
        throw new Error('Frontend Public Key fehlt!');
    }

    const frontendKey = crypto.createPublicKey({
        key: Buffer.from(frontendPublicKey, 'base64'),
        format: 'der',
        type: 'spki',
    });

    const verifier = crypto.createVerify('SHA256');
    verifier.update(encryptedData);
    verifier.end();

    if (!verifier.verify(frontendKey, Buffer.from(signature, 'base64'))) {
        throw new Error('Signaturprüfung fehlgeschlagen!');
    }

    const decryptedData = crypto.privateDecrypt(
        {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        Buffer.from(encryptedData, 'base64')
    ).toString('utf8');

    return decryptedData;
}

readRSAKeys();

// <--------- Database Operations --------->

const readDB = async () => {
    try {
        const data = await fs.readJson(dbPath);
        return data && data.users ? data : { users: [] };
    } catch (error) {
        console.error('Fehler beim Lesen der Datenbank:', error);
        return { users: [] };
    }
};

const writeDB = async (data) => {
    try {
        await fs.writeJson(dbPath, data, { spaces: 2 });
    } catch (error) {
        console.error('Fehler beim Speichern der Datenbank:', error);
    }
};

// <--------- Endpoints --------->

// Public Key des Backends abrufen
app.get('/public-key', (req, res) => {
    const base64Key = publicKey
        .replace(/-----BEGIN PUBLIC KEY-----/g, '')
        .replace(/-----END PUBLIC KEY-----/g, '')
        .replace(/\n/g, '');
    res.send({ publicKey: base64Key });
});

// Public Key des Frontends registrieren
app.post('/register-public-key', (req, res) => {
    frontendPublicKey = req.body.publicKey;
    console.log('Frontend Public Key erhalten');
    res.send({ message: 'Frontend Public Key erfolgreich registriert.' });
});

// Verschlüsselte Daten empfangen und verifizieren
app.post('/secure-data', async (req, res) => {
    try {
        const { encryptedData, signature } = req.body;

        if (!encryptedData || !signature) {
            throw new Error('Ungültige Anfrage. Beide Felder sind erforderlich.');
        }

        const decryptedData = decryptAndVerify({ encryptedData, signature });
        console.log('Entschlüsselte Nachricht:', decryptedData);

        res.send({ message: 'Sichere Nachricht erfolgreich empfangen.', decryptedData });
    } catch (error) {
        console.error('Fehler beim Verarbeiten der sicheren Nachricht:', error);
        res.status(400).send({ error: error.message });
    }
});

// Benutzer registrieren
app.post('/register', async (req, res) => {
    try {
        const { email, passwordHash, salt, data } = req.body;

        if (!email || !passwordHash || !salt || !data) {
            return res.status(400).send({ error: 'Ungültige Anfrage. Alle Felder sind erforderlich.' });
        }

        const db = await readDB();
        if (db.users.some(user => user.email === email)) {
            return res.status(400).send({ error: 'E-Mail ist bereits registriert.' });
        }

        db.users.push({ email, passwordHash, salt, data });
        await writeDB(db);

        res.send({ message: 'Registrierung erfolgreich.' });
    } catch (error) {
        console.error('Fehler bei der Registrierung:', error);
        res.status(500).send({ error: 'Interner Serverfehler.' });
    }
});

// Benutzerdaten abrufen
app.get('/data', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).send({ error: 'E-Mail-Adresse erforderlich.' });
        }

        const db = await readDB();
        const user = db.users.find(user => user.email === email);

        if (!user) {
            return res.status(404).send({ error: 'Benutzer nicht gefunden.' });
        }

        res.send({
            email: user.email,
            salt: user.salt,
            data: user.data || { ciphertext: '', iv: '' },
        });
    } catch (error) {
        console.error('Fehler beim Abrufen der Daten:', error);
        res.status(500).send({ error: 'Interner Serverfehler.' });
    }
});

// Passwort-Safe aktualisieren
app.post("/safe", async (req, res) => {
    const { email, ciphertext, iv } = req.body;

    if (!email || !ciphertext || !iv) {
        return res.status(400).send({ error: "Ungültige Anfrage." });
    }

    try {
        const db = await readDB();
        const user = db.users.find((user) => user.email === email);

        if (!user) {
            return res.status(404).send({ error: "Benutzer nicht gefunden." });
        }

        user.data = { ciphertext, iv };
        await writeDB(db);

        res.send({ message: "Passwort-Safe erfolgreich aktualisiert." }); // Antwort bei Erfolg
    } catch (error) {
        console.error("Fehler beim Speichern des Passwort-Safes:", error);
        res.status(500).send({ error: "Interner Serverfehler." });
    }
});

// Server starten
app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));
