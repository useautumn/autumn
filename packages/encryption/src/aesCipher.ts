import crypto from "node:crypto";

const IV_BYTES = 16;
const KEY_BYTES = 32;

export const createAesCipher = ({ password }: { password: string }) => {
	const key = crypto
		.createHash("sha512")
		.update(password)
		.digest("hex")
		.substring(0, KEY_BYTES);

	const encrypt = (plain: string): string => {
		const iv = crypto.randomBytes(IV_BYTES);
		const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
		const encrypted = Buffer.concat([
			cipher.update(plain, "utf8"),
			cipher.final(),
		]);
		return Buffer.concat([iv, encrypted]).toString("base64");
	};

	const decrypt = (encoded: string): string => {
		const buffer = Buffer.from(encoded, "base64");
		const iv = buffer.subarray(0, IV_BYTES);
		const encrypted = buffer.subarray(IV_BYTES);
		const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
		return Buffer.concat([
			decipher.update(encrypted),
			decipher.final(),
		]).toString("utf8");
	};

	return { encrypt, decrypt };
};

export type AesCipher = ReturnType<typeof createAesCipher>;
