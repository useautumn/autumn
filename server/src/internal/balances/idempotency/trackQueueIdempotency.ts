import { ms } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { hashIdempotencyKey } from "@/internal/misc/idempotency/idempotencyKeyUtils.js";

export const TRACK_V3_IDEMPOTENCY_TTL_MS = ms.days(1);

/** Seed for the per-feature queue-replay keys: scopes them to one request id
 *  (an SQS replay reuses the original request's ctx.id). */
export const getTrackQueueIdempotencyKey = ({ ctx }: { ctx: AutumnContext }) =>
	`track:${ctx.id}`;

/** Dedupes one (request, customer, feature) deduction. Set atomically inside
 *  the deduction Lua script; the `{customerId}` hash-tag co-locates the key
 *  with the customer's balance slot so the script stays single-node. */
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
		`${getTrackQueueIdempotencyKey({ ctx })}:feature:${featureId}`,
	);
	return {
		hashedKey,
		redisKey: `{${customerId}}:${ctx.org.id}:${ctx.env}:idempotency:${hashedKey}`,
	};
};

/** Carries partial multi-feature deduction results across an SQS redelivery so
 *  completed features can still be mirrored to Postgres and included in the event. */
export const getRedisTrackReplayStateKey = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => {
	const hashedKey = hashIdempotencyKey(
		`${getTrackQueueIdempotencyKey({ ctx })}:replay-state`,
	);
	return {
		hashedKey,
		redisKey: `{${customerId}}:${ctx.org.id}:${ctx.env}:idempotency:${hashedKey}`,
	};
};
