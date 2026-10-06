import { deepFreeze } from "./deepFreeze.js";

/** An org's customers mostly carry the same catalog and org: each distinct text is held once, frozen, not per subject. */
const MAX_SHARED_TEXTS = 256;

const heldByHash = new Map<string, unknown>();

/** The text's identity in storage: equal hashes are equal texts, so one stored copy and one held copy serve every row. */
export const sharedTextHash = (text: string): string =>
	new Bun.CryptoHasher("sha256").update(text).digest("base64");

/** The one copy held for the hash; `load` (a parse of the stored text, or a push's own value) runs only for a new hash. */
export const sharedJson = <T>({
	hash,
	load,
}: {
	hash: string;
	load: () => T;
}): T => {
	const held = heldByHash.get(hash);
	if (held !== undefined) return held as T;
	const value = deepFreeze(load());
	if (heldByHash.size >= MAX_SHARED_TEXTS)
		heldByHash.delete(heldByHash.keys().next().value as string);
	heldByHash.set(hash, value);
	return value;
};
