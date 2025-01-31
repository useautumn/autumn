import { AppEnv } from "@autumn/shared";
import crypto from "crypto";
import KSUID from "ksuid";

const getKey = () => {
  return crypto
    .createHash("sha512")
    .update(process.env.ENCRYPTION_PASSWORD!)
    .digest("hex")
    .substring(0, 32);
};

export function encryptData(data: string) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(data, "utf8"),
    cipher.final(),
  ]);

  // Combine IV and encrypted data
  const result = Buffer.concat([iv, encrypted]);
  return result.toString("base64");
}

export function decryptData(encryptedData: string) {
  const buffer = Buffer.from(encryptedData, "base64");

  // Extract IV and encrypted data
  const iv = buffer.slice(0, 16);
  const encrypted = buffer.slice(16);

  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export const generatePublishableKey = (env: string) => {
  // let rand = crypto
  //   .randomBytes(75) // 75 bytes will give ~100 characters in base64
  //   .toString("base64")
  //   .replace(/[+/=]/g, "") // Remove non-URL safe characters
  //   .slice(0, 100); // Ensure exactly 100 characters

  let envString = env === AppEnv.Sandbox ? "test_" : "live_";
  return `am_pk_${envString}${KSUID.randomSync().string}`;
};
