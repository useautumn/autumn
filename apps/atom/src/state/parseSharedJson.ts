import { deepFreeze } from "./deepFreeze.js";

/** An org's customers mostly carry the same catalog and org: each distinct text is parsed and frozen once, not per read. */
const MAX_SHARED_TEXTS = 256;

const parsedByHash = new Map<string, unknown>();

/** The text's identity in storage: equal hashes are equal texts, so one stored copy and one parsed copy serve every row. */
export const sharedTextHash = (text: string): string =>
	new Bun.CryptoHasher("sha256").update(text).digest("base64");

/** One frozen copy per hash; the text is read only when this process has not parsed it yet. */
export const parseSharedJson = <T>({
	hash,
	readText,
}: {
	hash: string;
	readText: () => string;
}): T => {
	const held = parsedByHash.get(hash);
	if (held !== undefined) return held as T;
	const parsed = deepFreeze(JSON.parse(readText()));
	if (parsedByHash.size >= MAX_SHARED_TEXTS)
		parsedByHash.delete(parsedByHash.keys().next().value as string);
	parsedByHash.set(hash, parsed);
	return parsed;
};
