export const hashIdempotencyKey = (key: string): string => {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(key);
	return hasher.digest("base64url");
};

/** The partition key. Its format is load-bearing across a deploy: a change orphans every in-flight key for its full TTL. */
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
	return { hashedKey, storageKey: `${orgId}:${env}:idempotency:${hashedKey}` };
};
