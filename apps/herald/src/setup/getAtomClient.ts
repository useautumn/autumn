import { createAesCipher } from "@autumn/encryption";
import { getCacheEnv } from "@autumn/env/cache";
import { createAtomClient } from "../atom/createAtomClient.js";
import type { AtomClient, GetAtomClient } from "../atom/types/atomClient.js";

/** An Atom sits in the org's own cloud: a push that takes longer than this is given up on, never waited out. */
const ATOM_REQUEST_TIMEOUT_MS = 2_000;

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
		config: { timeoutMs: ATOM_REQUEST_TIMEOUT_MS, decrypt },
	});
	atomClients.set(key, atomClient);
	return atomClient;
};
