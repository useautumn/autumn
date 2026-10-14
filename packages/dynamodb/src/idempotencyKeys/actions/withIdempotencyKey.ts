import type {
	IdempotencyClaim,
	IdempotencyKeyStore,
} from "../types/idempotencyKey.js";

const releaseAlways = (): boolean => true;

export const withIdempotencyKey = async <T>({
	store,
	claim,
	run,
	onDuplicate,
	releaseOnError = releaseAlways,
	releaseOnSuccess,
}: {
	store: IdempotencyKeyStore;
	claim: IdempotencyClaim | undefined;
	run: () => Promise<T>;
	onDuplicate: () => T | Promise<T>;
	releaseOnError?: (error: unknown) => boolean;
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
