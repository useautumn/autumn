import type { FindInvalidKeys, SecretKeys } from "./types/secretKeys.js";

/** A revoked key stops opening the Atom within about this long. */
const SECRET_KEYS_SYNC_MS = 5 * 60_000;

/** A key opens the Atom only once Autumn confirms it is the org's; only Autumn naming a key invalid removes it. */
export const startSecretKeys = ({
	findInvalid,
	everyMs = SECRET_KEYS_SYNC_MS,
}: {
	findInvalid: FindInvalidKeys;
	everyMs?: number;
}): SecretKeys => {
	const known = new Set<string>();
	const pending = new Set<string>();

	async function sync(): Promise<void> {
		const keyHashes = [...known, ...pending];
		if (keyHashes.length === 0) return;
		const invalid = await findInvalid({ keyHashes });
		if (!invalid) return;
		const invalidHashes = new Set(invalid);
		for (const keyHash of keyHashes) {
			pending.delete(keyHash);
			if (invalidHashes.has(keyHash)) known.delete(keyHash);
			else known.add(keyHash);
		}
	}

	function learn({ keyHash }: { keyHash: string }): void {
		if (known.has(keyHash) || pending.has(keyHash)) return;
		pending.add(keyHash);
		void sync();
	}

	const timer = setInterval(sync, everyMs);
	timer.unref?.();

	return {
		isKnown: ({ keyHash }) => known.has(keyHash),
		learn,
		sync,
		stop: () => clearInterval(timer),
	};
};
