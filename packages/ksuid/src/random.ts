/**
 * Generate `size` cryptographically secure random bytes.
 * Uses the Web Crypto API (globalThis.crypto.getRandomValues), available in
 * all modern browsers, Node.js 19+, Bun, and Deno.
 */
export const getRandomBytes = ({ size }: { size: number }): Uint8Array => {
	const buffer = new Uint8Array(size);
	globalThis.crypto.getRandomValues(buffer);
	return buffer;
};
