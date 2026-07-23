import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : stableStringify(value)).digest("hex");
}

export function secureToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function tokenDigest(token) {
  return sha256(`sealed-token:v1:${token}`);
}

export function safeTokenMatch(token, digest) {
  const actual = Buffer.from(tokenDigest(token), "hex");
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function recordKey(masterKey, recordId) {
  return Buffer.from(hkdfSync("sha256", masterKey, Buffer.from("tieban-sealed-v1"), Buffer.from(recordId), 32));
}

export function encryptRecord(masterKey, recordId, value, modelVersion) {
  const iv = randomBytes(12);
  const aad = Buffer.from(`${modelVersion}:${recordId}`);
  const cipher = createCipheriv("aes-256-gcm", recordKey(masterKey, recordId), iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(stableStringify(value), "utf8"), cipher.final()]);
  return {
    recordId,
    modelVersion,
    algorithm: "AES-256-GCM",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    sha256: sha256(ciphertext)
  };
}

export function decryptRecord(masterKey, envelope) {
  const decipher = createDecipheriv("aes-256-gcm", recordKey(masterKey, envelope.recordId), Buffer.from(envelope.iv, "base64url"));
  decipher.setAAD(Buffer.from(`${envelope.modelVersion}:${envelope.recordId}`));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

export function keyedUnitInterval(secret, ...parts) {
  const bytes = createHmac("sha256", secret).update(parts.join(":"), "utf8").digest();
  return bytes.readUInt32BE(0) / 0x100000000;
}

export class AuditChain {
  #entries = [];
  #head = "0".repeat(64);

  append(action, payload = {}) {
    const entry = {
      index: this.#entries.length,
      at: Date.now(),
      action,
      payloadHash: sha256(payload),
      previousHash: this.#head
    };
    const hash = sha256(entry);
    const sealed = { ...entry, hash };
    this.#entries.push(sealed);
    this.#head = hash;
    return sealed;
  }

  snapshot() {
    return { head: this.#head, count: this.#entries.length, entries: this.#entries.map((entry) => ({ ...entry })) };
  }

  static verify(snapshot) {
    let previousHash = "0".repeat(64);
    for (let index = 0; index < snapshot.entries.length; index += 1) {
      const entry = snapshot.entries[index];
      if (entry.index !== index || entry.previousHash !== previousHash) return false;
      const { hash, ...unsigned } = entry;
      if (sha256(unsigned) !== hash) return false;
      previousHash = hash;
    }
    return snapshot.count === snapshot.entries.length && snapshot.head === previousHash;
  }
}
