import crypto from "node:crypto";
import { env } from "./env.js";

const key = () =>
	crypto
		.createHash("sha512")
		.update(env.ENCRYPTION_PASSWORD)
		.digest("hex")
		.substring(0, 32);

export const encrypt = (data: string) => {
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv("aes-256-cbc", key(), iv);
	return Buffer.concat([
		iv,
		cipher.update(data, "utf8"),
		cipher.final(),
	]).toString("base64");
};

export const decrypt = (data: string) => {
	const buffer = Buffer.from(data, "base64");
	const decipher = crypto.createDecipheriv(
		"aes-256-cbc",
		key(),
		buffer.subarray(0, 16),
	);
	return Buffer.concat([
		decipher.update(buffer.subarray(16)),
		decipher.final(),
	]).toString("utf8");
};
