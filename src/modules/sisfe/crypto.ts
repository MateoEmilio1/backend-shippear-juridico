import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

const getKey = (): Buffer => {
  const key = process.env.SISFE_TOKEN_KEY;
  if (!key) throw new Error("SISFE_TOKEN_KEY no esta definido");
  const buffer = Buffer.from(key, "base64");
  if (buffer.length !== 32) throw new Error("SISFE_TOKEN_KEY debe decodificar a 32 bytes (clave AES-256 en base64)");
  return buffer;
};

export const encryptToken = (plainText: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((buffer) => buffer.toString("base64")).join(".");
};

export const decryptToken = (cipherText: string): string => {
  const [ivB64, authTagB64, dataB64] = cipherText.split(".");
  if (!ivB64 || !authTagB64 || !dataB64) throw new Error("Formato de token cifrado invalido");

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
};
