import { createAesCipher } from "@autumn/encryption";
import { getCacheEnv } from "@autumn/env/cache";
import { createAtomClient } from "../atom/createAtomClient.js";
import type {
	AtomClient,
	AtomDelivery,
	GetAtomClient,
} from "../atom/types/atomClient.js";

/** A subject is sent once: an Atom sits in the org's own cloud, and the customer's next change corrects a miss. */
const SUBJECT_DELIVERY: AtomDelivery = { timeoutMs: 2_000, retry: null };

/** The catalog is rare and every customer reads it, so it gets three tries: at most ~35s, waits included. */
const CATALOG_DELIVERY: AtomDelivery = {
	timeoutMs: 10_000,
	retry: { attempts: 3, baseDelayMs: 500, maxDelayMs: 5_000 },
};

const unreadableToken = (): string => {
	throw new Error(
		"ENCRYPTION_PASSWORD is not set; an Atom's token cannot be read",
	);
};

/** Opens the token the server encrypted onto the org's record. */
function decryptOf(): (encrypted: string) => string {
	const password = getCacheEnv().CACHE_ENCRYPTION_PASSWORD;
	return password ? createAesCipher({ password }).decrypt : unreadableToken;
}

let decrypt: ((encrypted: string) => string) | undefined;
const atomClients = new Map<string, AtomClient>();

/** One client per org's Atom, made on its first push. A re-created Atom has a new token, so a new client. */
export const getAtomClient: GetAtomClient = ({ connection }) => {
	const key = `${connection.endpointUrl} ${connection.encryptedToken}`;
	const held = atomClients.get(key);
	if (held) return held;

	decrypt ??= decryptOf();
	const atomClient = createAtomClient({
		connection,
		config: { decrypt, subjects: SUBJECT_DELIVERY, catalog: CATALOG_DELIVERY },
	});
	atomClients.set(key, atomClient);
	return atomClient;
};
