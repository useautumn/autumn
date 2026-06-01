import crypto from "node:crypto";
import { env } from "./env.js";

const key = () =>
	crypto.createHash("sha256").update(env.ENCRYPTION_PASSWORD).digest();

export const encrypt = (data: string) => {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(data, "utf8"),
		cipher.final(),
	]);
	return Buffer.concat([
		Buffer.from([1]),
		iv,
		cipher.getAuthTag(),
		ciphertext,
	]).toString("base64");
};

export const decrypt = (data: string) => {
	const buffer = Buffer.from(data, "base64");
	if (buffer[0] !== 1) throw new Error("Unsupported encrypted payload");
	const iv = buffer.subarray(1, 13);
	const authTag = buffer.subarray(13, 29);
	const ciphertext = buffer.subarray(29);
	const decipher = crypto.createDecipheriv(
		"aes-256-gcm",
		key(),
		iv,
	);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
		"utf8",
	);
};
