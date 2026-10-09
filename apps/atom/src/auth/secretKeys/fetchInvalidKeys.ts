import {
	ATOM_KEYS_PATH,
	ATOM_TOKEN_HASH_HEADER,
	AtomKeysResponseSchema,
} from "@autumn/byoc";
import type { AutumnLogger } from "@autumn/logging";

const FETCH_TIMEOUT_MS = 10_000;

/** Null for any reply that is not a clear answer, so a failed or slow call never drops a key. */
export const fetchInvalidKeys = async ({
	ctx,
	keyHashes,
}: {
	ctx: {
		autumnApiUrl: string;
		tokenHash: string;
		logger: Pick<AutumnLogger, "warn">;
	};
	keyHashes: string[];
}): Promise<string[] | null> => {
	try {
		const reply = await fetch(`${ctx.autumnApiUrl}${ATOM_KEYS_PATH}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[ATOM_TOKEN_HASH_HEADER]: ctx.tokenHash,
			},
			body: JSON.stringify({ key_hashes: keyHashes }),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!reply.ok) throw new Error(`Autumn answered ${reply.status}`);
		return AtomKeysResponseSchema.parse(await reply.json()).invalid_key_hashes;
	} catch (error) {
		ctx.logger.warn(
			{ type: "atom_secret_keys_sync_failed", error },
			"Could not check the Atom's secret keys with Autumn",
		);
		return null;
	}
};
