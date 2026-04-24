import { ms } from "@autumn/shared";

export const TRACK_V3_IDEMPOTENCY_TTL_MS = ms.days(2);

export const getTrackIdempotencyKey = ({
	idempotencyKey,
	requestId,
}: {
	idempotencyKey?: string;
	requestId: string;
}) => `track:${idempotencyKey ?? requestId}`;

const hashIdempotencyKey = (key: string) => {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(key);
	return hasher.digest("base64url");
};

export const getRedisTrackFeatureIdempotencyKey = ({
	orgId,
	env,
	customerId,
	trackIdempotencyKey,
	featureId,
}: {
	orgId: string;
	env: string;
	customerId: string;
	trackIdempotencyKey: string;
	featureId: string;
}) => {
	const hashedKey = hashIdempotencyKey(
		`${trackIdempotencyKey}:feature:${featureId}`,
	);
	return {
		hashedKey,
		redisKey: `{${customerId}}:${orgId}:${env}:idempotency:${hashedKey}`,
	};
};
