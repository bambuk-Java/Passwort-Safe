import './App.css';
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { hash } from "argon2-wasm";

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <nav>
            <Link to="/">Home</Link> | <Link to="/register">Registrieren</Link> | <Link to="/login">Anmelden</Link>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </Router>
  );
}

function Home() {
  const [passwordSafe, setPasswordSafe] = useState({}); // JSON-Liste
  const [formData, setFormData] = useState({
    website: "",
    username: "",
    password: "",
    note: "",
  });
  const [editId, setEditId] = useState(null); // ID des Eintrags, der bearbeitet wird
  const [aesKey, setAesKey] = useState(null);
  const [passwordVisibility, setPasswordVisibility] = useState({}); // Sichtbarkeit der Passwörter
  const navigate = useNavigate();

  useEffect(() => {
    const email = localStorage.getItem("userEmail");
    const password = localStorage.getItem("userPassword");

    if (!email || !password) {
      navigate("/login");
      return;
    }

    const loadSafe = async () => {
      try {
        const response = await fetch(`http://localhost:8080/data?email=${email}`);
        if (!response.ok) {
          throw new Error("Fehler beim Abrufen des Passwort-Safes.");
        }

        const { data, salt } = await response.json();
        const aesKey = await deriveKey(password, salt);
        setAesKey(aesKey);

        if (data.ciphertext) {
          const decryptedSafe = await decryptData(aesKey, data.ciphertext, data.iv);
          setPasswordSafe(JSON.parse(decryptedSafe || "{}")); // JSON-Objekt sicherstellen
        } else {
          setPasswordSafe({});
        }
      } catch (error) {
        console.error("Fehler beim Laden des Passwort-Safes:", error);
      }
    };

    loadSafe();
  }, [navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveNewEntry = async () => {
    try {
      const id = Date.now(); // Neue ID generieren
      const updatedSafe = { ...passwordSafe, [id]: formData }; // JSON-Liste aktualisieren
      await saveSafe(updatedSafe); // Speichern im Backend
      setPasswordSafe(updatedSafe); // Lokale Aktualisierung
      setFormData({ website: "", username: "", password: "", note: "" }); // Eingaben zurücksetzen
    } catch (error) {
      console.error("Fehler beim Speichern eines neuen Eintrags:", error);
      alert("Speichern fehlgeschlagen. Bitte versuche es erneut.");
    }
  };

  const handleEditChange = (id, field, value) => {
    setPasswordSafe((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleSaveEditedEntry = async (id) => {
    try {
      const updatedSafe = { ...passwordSafe };
      await saveSafe(updatedSafe); // Speichern im Backend
      setPasswordSafe(updatedSafe); // Lokale Aktualisierung
      setEditId(null); // Bearbeitungsmodus beenden
    } catch (error) {
      console.error("Fehler beim Speichern eines Eintrags:", error);
      alert("Speichern fehlgeschlagen. Bitte versuche es erneut.");
    }
  };

  const handleDeleteEntry = async (id) => {
    const { [id]: _, ...updatedSafe } = passwordSafe; // Eintrag entfernen
    await saveSafe(updatedSafe);
    setPasswordSafe(updatedSafe);
  };

  const togglePasswordVisibility = (id) => {
    setPasswordVisibility((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("In die Zwischenablage kopiert!");
    });
  };

  const saveSafe = async (safe) => {
    try {
      const email = localStorage.getItem("userEmail");
      const { ciphertext, iv } = await encryptData(aesKey, JSON.stringify(safe || {}));

      const response = await fetch("http://localhost:8080/safe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ciphertext, iv }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Speichern der Daten im Backend.");
      }

      const result = await response.json();
      if (result.message !== "Passwort-Safe erfolgreich aktualisiert.") {
        throw new Error("Unerwartete Antwort vom Server.");
      }

      console.log("Safe erfolgreich gespeichert:", result.message);
    } catch (error) {
      console.error("Fehler beim Speichern im Backend:", error);
      throw error;
    }
  };

  return (
    <div>
      <h1>Passwort-Safe</h1>
      <div>
        <h2>Neuer Eintrag</h2>
        <input
          type="text"
          name="website"
          placeholder="Webseite"
          value={formData.website}
          onChange={handleInputChange}
        />
        <input
          type="text"
          name="username"
          placeholder="Username/Email"
          value={formData.username}
          onChange={handleInputChange}
        />
        <input
          type="password"
          name="password"
          placeholder="Passwort"
          value={formData.password}
          onChange={handleInputChange}
        />
        <textarea
          name="note"
          placeholder="Notiz"
          value={formData.note}
          onChange={handleInputChange}
        />
        <button onClick={handleSaveNewEntry}>Speichern</button>
      </div>

      <div>
        <h2>Gespeicherte Einträge</h2>
        {Object.keys(passwordSafe).length > 0 ? (
          Object.entries(passwordSafe).map(([id, entry]) => (
            <div key={id}>
              {editId === id ? (
                <div>
                  <input
                    type="text"
                    value={entry.website}
                    onChange={(e) => handleEditChange(id, "website", e.target.value)}
                    placeholder="Webseite"
                  />
                  <input
                    type="text"
                    value={entry.username}
                    onChange={(e) => handleEditChange(id, "username", e.target.value)}
                    placeholder="Username/Email"
                  />
                  <input
                    type="password"
                    value={entry.password}
                    onChange={(e) => handleEditChange(id, "password", e.target.value)}
                    placeholder="Passwort"
                  />
                  <textarea
                    value={entry.note}
                    onChange={(e) => handleEditChange(id, "note", e.target.value)}
                    placeholder="Notiz"
                  />
                  <button onClick={() => handleSaveEditedEntry(id)}>Speichern</button>
                  <button onClick={() => setEditId(null)}>Abbrechen</button>
                </div>
              ) : (
                <div>
                  <p>
                    Webseite:{" "}
                    <a href={entry.website} target="_blank" rel="noopener noreferrer">
                      {entry.website}
                    </a>
                  </p>
                  <p>
                    Username: {entry.username}{" "}
                    <button onClick={() => copyToClipboard(entry.username)}>Kopieren</button>
                  </p>
                  <p>
                    Passwort:{" "}
                    {passwordVisibility[id] ? entry.password : "********"}{" "}
                    <button onClick={() => togglePasswordVisibility(id)}>
                      {passwordVisibility[id] ? "Verbergen" : "Anzeigen"}
                    </button>{" "}
                    <button onClick={() => copyToClipboard(entry.password)}>Kopieren</button>
                  </p>
                  <p>Notiz: {entry.note}</p>
                  <button onClick={() => setEditId(id)}>Bearbeiten</button>
                  <button onClick={() => handleDeleteEntry(id)}>Löschen</button>
                </div>
              )}
            </div>
          ))
        ) : (
          <p>Keine Einträge verfügbar.</p>
        )}
      </div>
    </div>
  );
}
function Register() {
  const navigate = useNavigate();

  async function handleRegister(event) {
    event.preventDefault();

    const email = event.target.email.value;
    const password = event.target.password.value;

    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltBase64 = btoa(String.fromCharCode(...salt));

      const { encodedHash } = await hashPassword(password);
      const aesKey = await deriveKey(password, saltBase64);
      const initialData = JSON.stringify([]);

      const { ciphertext, iv } = await encryptData(aesKey, initialData);

      await fetch("http://localhost:8080/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          passwordHash: encodedHash,
          salt: saltBase64,
          data: { ciphertext, iv },
        }),
      });

      localStorage.setItem("userEmail", email);
      localStorage.setItem("userPassword", password);
      navigate("/");
    } catch (error) {
      console.error("Fehler bei der Registrierung:", error);
      alert("Registrierung fehlgeschlagen.");
    }
  }

  return (
    <form onSubmit={handleRegister}>
      <h1>Registrieren</h1>
      <label>Email:</label>
      <input type="email" name="email" required />
      <label>Passwort:</label>
      <input type="password" name="password" required />
      <button type="submit">Registrieren</button>
    </form>
  );
}

function Login() {
  const navigate = useNavigate();

  async function handleLogin(event) {
    event.preventDefault();

    const email = event.target.email.value;
    const password = event.target.password.value;

    try {
      const response = await fetch(`http://localhost:8080/data?email=${email}`);
      if (!response.ok) throw new Error("Fehler beim Abrufen der Daten.");

      const { data, salt } = await response.json();
      const aesKey = await deriveKey(password, salt);

      const decryptedData = await decryptData(aesKey, data.ciphertext, data.iv);

      localStorage.setItem("userEmail", email);
      localStorage.setItem("userPassword", password);
      navigate("/");
    } catch (error) {
      console.error("Fehler beim Login:", error);
      alert("Login fehlgeschlagen.");
    }
  }

  return (
    <form onSubmit={handleLogin}>
      <h1>Anmelden</h1>
      <label>Email:</label>
      <input type="email" name="email" required />
      <label>Passwort:</label>
      <input type="password" name="password" required />
      <button type="submit">Anmelden</button>
    </form>
  );
}

async function encryptData(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedData = new TextEncoder().encode(data);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedData
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

async function decryptData(key, ciphertext, iv) {
  const decodedCiphertext = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const decodedIV = Uint8Array.from(atob(iv), c => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodedIV },
    key,
    decodedCiphertext
  );

  return new TextDecoder().decode(decrypted);
}

async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(atob(salt), c => c.charCodeAt(0)),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const options = {
    pass: password,
    salt,
    time: 3,
    mem: 4096,
    hashLen: 32,
    parallelism: 1,
    type: "argon2id",
  };

  const result = await hash(options);
  return { encodedHash: btoa(String.fromCharCode(...result.hash)), salt: btoa(String.fromCharCode(...salt)) };
}

export default App;
