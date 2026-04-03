/**
 * Recursively sort object keys, strip undefined values, and produce a stable string.
 * Array element order is preserved; object key order is not.
 */
const deterministicStringify = (value: unknown): string => {
	if (value === null || value === undefined) return "null";
	if (typeof value !== "object") return JSON.stringify(value);

	if (Array.isArray(value))
		return `[${value.map(deterministicStringify).join(",")}]`;

	const obj = value as Record<string, unknown>;

	if (typeof obj.toJSON === "function")
		return deterministicStringify(obj.toJSON());

	const sortedKeys = Object.keys(obj)
		.filter((k) => obj[k] !== undefined)
		.sort();

	return `{${sortedKeys.map((k) => `${JSON.stringify(k)}:${deterministicStringify(obj[k])}`).join(",")}}`;
};

/** Produce a SHA-256 hex digest from any JSON-serialisable value, key-order independent. */
export const hashJson = ({ value }: { value: unknown }): string => {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(deterministicStringify(value));
	return hasher.digest("hex");
};
