import { ms } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const TRACK_V3_IDEMPOTENCY_TTL_MS = ms.days(2);

export const getTrackIdempotencyKey = ({ ctx }: { ctx: AutumnContext }) =>
	`track:${ctx.id}`;

const hashIdempotencyKey = (key: string) => {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(key);
	return hasher.digest("base64url");
};

export const getRedisTrackFeatureIdempotencyKey = ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}) => {
	const hashedKey = hashIdempotencyKey(
		`${getTrackIdempotencyKey({ ctx })}:feature:${featureId}`,
	);
	return {
		hashedKey,
		redisKey: `{${customerId}}:${ctx.org.id}:${ctx.env}:idempotency:${hashedKey}`,
	};
};
