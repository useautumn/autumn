import { ms } from "@autumn/shared";

export const IDEMPOTENCY_TTL_MS = ms.hours(24);

/** The store either claims the key, rejects it as already claimed, or is
 *  unavailable — unavailability fails open (the request is allowed). */
export type IdempotencyClaimResult = "claimed" | "duplicate" | "unavailable";

export const hashIdempotencyKey = (key: string): string => {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(key);
	return hasher.digest("base64url");
};

/** The DynamoDB partition key. Format is load-bearing across a deploy — a
 *  change orphans every in-flight key for its full TTL. */
export const buildIdempotencyStorageKey = ({
	orgId,
	env,
	idempotencyKey,
}: {
	orgId: string;
	env: string;
	idempotencyKey: string;
}): { hashedKey: string; storageKey: string } => {
	const hashedKey = hashIdempotencyKey(idempotencyKey);
	return {
		hashedKey,
		storageKey: `${orgId}:${env}:idempotency:${hashedKey}`,
	};
};
