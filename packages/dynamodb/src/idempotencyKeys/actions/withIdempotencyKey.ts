import type {
	IdempotencyClaim,
	IdempotencyKeyStore,
} from "../types/idempotencyKey.js";

const releaseAlways = (): boolean => true;

/**
 * Runs `run` under a claim: a live claim by someone else answers with `onDuplicate` instead,
 * a failure the caller may retry releases the key, and an unavailable store fails open.
 */
export const withIdempotencyKey = async <T>({
	store,
	claim,
	run,
	onDuplicate,
	releaseOnError = releaseAlways,
	releaseOnSuccess,
}: {
	store: IdempotencyKeyStore;
	/** Nothing to claim runs straight through. */
	claim: IdempotencyClaim | undefined;
	run: () => Promise<T>;
	/** The API throws a 409 here; a queue consumer skips the item. */
	onDuplicate: () => T | Promise<T>;
	/** Which failures free the key for a retry. A duplicate never should. */
	releaseOnError?: (error: unknown) => boolean;
	/** Frees the key although `run` resolved: the work was handed off, or the reply is retryable. */
	releaseOnSuccess?: (result: T) => boolean;
}): Promise<T> => {
	if (!claim) return run();
	const outcome = await store.claim(claim);
	if (outcome === "duplicate") return onDuplicate();
	const release = () =>
		store.release({ storageKey: claim.storageKey, owner: claim.owner });
	try {
		const result = await run();
		if (releaseOnSuccess?.(result)) await release();
		return result;
	} catch (error) {
		if (releaseOnError(error)) await release();
		throw error;
	}
};
