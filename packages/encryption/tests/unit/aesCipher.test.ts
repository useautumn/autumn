import { expect, test } from "bun:test";
import crypto from "node:crypto";
import { createAesCipher } from "../../src/encryption.js";

/** The scheme the server wrote secrets with before this package existed. */
const legacyEncrypt = ({
	password,
	data,
}: {
	password: string;
	data: string;
}) => {
	const key = crypto
		.createHash("sha512")
		.update(password)
		.digest("hex")
		.substring(0, 32);
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
	const encrypted = Buffer.concat([
		cipher.update(data, "utf8"),
		cipher.final(),
	]);
	return Buffer.concat([iv, encrypted]).toString("base64");
};

test("round-trips, and decrypts what the legacy server cipher wrote", () => {
	const { encrypt, decrypt } = createAesCipher({ password: "p@ss" });
	expect(decrypt(encrypt("sk_test_123"))).toBe("sk_test_123");
	expect(
		decrypt(legacyEncrypt({ password: "p@ss", data: "rediss://backup:6385" })),
	).toBe("rediss://backup:6385");
});

test("a different password cannot decrypt", () => {
	const encrypted = createAesCipher({ password: "one" }).encrypt("secret");
	expect(() =>
		createAesCipher({ password: "two" }).decrypt(encrypted),
	).toThrow();
});
