export const getRandomBytes = ({ size }: { size: number }): Uint8Array => {
	const buffer = new Uint8Array(size);
	globalThis.crypto.getRandomValues(buffer);
	return buffer;
};
