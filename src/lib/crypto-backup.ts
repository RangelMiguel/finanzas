/**
 * PBKDF2 + AES-GCM backup encryption (Web Crypto compatible, Node implementation)
 */

const SALT_LEN = 16;
const IV_LEN = 12;
const ITERATIONS = 100000;

function b64encode(buf: ArrayBuffer | Uint8Array) {
  return Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64");
}

function b64decode(s: string) {
  return new Uint8Array(Buffer.from(s, "base64"));
}

export async function encryptBackup(json: string, password: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(json)
  );
  const out = new Uint8Array(SALT_LEN + IV_LEN + cipher.byteLength);
  out.set(salt, 0);
  out.set(iv, SALT_LEN);
  out.set(new Uint8Array(cipher), SALT_LEN + IV_LEN);
  return out;
}

export async function decryptBackup(data: Uint8Array, password: string): Promise<string> {
  const salt = data.slice(0, SALT_LEN);
  const iv = data.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const cipher = data.slice(SALT_LEN + IV_LEN);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

export { b64encode, b64decode };
