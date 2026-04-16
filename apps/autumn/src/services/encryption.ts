const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const TAG_LENGTH = 128;
const HEX_RE = /^[0-9a-f]+$/i;

async function getKey(encryptionKey: string): Promise<CryptoKey> {
	const keyBytes = hexToBytes(encryptionKey, "encryption key");
	if (keyBytes.length !== 16 && keyBytes.length !== 24 && keyBytes.length !== 32) {
		throw new Error("ENCRYPTION_KEY must be 32, 48, or 64 hex characters");
	}

	return crypto.subtle.importKey(
		"raw",
		keyBytes as BufferSource,
		{ name: ALGORITHM },
		false,
		["encrypt", "decrypt"],
	);
}

function hexToBytes(hex: string, label: string): Uint8Array {
	const normalized = hex.trim();
	if (normalized.length === 0 || normalized.length % 2 !== 0 || !HEX_RE.test(normalized)) {
		throw new Error(`Invalid ${label} hex`);
	}

	const bytes = new Uint8Array(normalized.length / 2);
	for (let i = 0; i < normalized.length; i += 2) {
		bytes[i / 2] = Number.parseInt(normalized.substring(i, i + 2), 16);
	}
	return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function encrypt(plaintext: string, encryptionKey: string): Promise<string> {
	const key = await getKey(encryptionKey);
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const encoded = new TextEncoder().encode(plaintext);

	const ciphertext = await crypto.subtle.encrypt(
		{ name: ALGORITHM, iv, tagLength: TAG_LENGTH },
		key,
		encoded,
	);

	const ivHex = bytesToHex(iv);
	const ctHex = bytesToHex(new Uint8Array(ciphertext));
	return `${ivHex}:${ctHex}`;
}

export async function decrypt(encrypted: string, encryptionKey: string): Promise<string> {
	const key = await getKey(encryptionKey);
	const parts = encrypted.split(":");
	if (parts.length !== 2) {
		throw new Error("Invalid encrypted payload format");
	}

	const [ivHex, ctHex] = parts;
	const iv = hexToBytes(ivHex, "iv");
	if (iv.length !== IV_LENGTH) {
		throw new Error("Invalid iv length");
	}

	const ciphertext = hexToBytes(ctHex, "ciphertext");

	const plaintext = await crypto.subtle.decrypt(
		{ name: ALGORITHM, iv: iv as BufferSource, tagLength: TAG_LENGTH },
		key,
		ciphertext as BufferSource,
	);

	return new TextDecoder().decode(plaintext);
}
