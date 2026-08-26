import { createHash } from "node:crypto";
import type {
	MeteringEvent,
	MeteringEventType,
} from "../events/meteringEventSchema.js";

const EVENT_ID_HASH_LENGTH = 32;

/** The type lives in the prefix rather than the digest so a deduct id is
 *  byte-identical to what the tap produced before grants and resets existed,
 *  while a grant and a deduct that share a mutation id still get distinct ids. */
const EVENT_ID_PREFIX: Record<MeteringEventType, string> = {
	deduct: "shd",
	grant: "shg",
	reset: "shr",
};

export type ShadowTapParams = {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	value: number;
	/** The source request's idempotency key, or the mutation id of whatever
	 *  wrote the balance. Anything stable across a retry of the same write. */
	idempotencyKey: string;
};

/** Derived, never random: a redelivered or retried mutation carries the same
 *  idempotency key, so the mirrored event keeps the same id and the metering
 *  fold dedupes it instead of double-counting. Scoped per (org, env, customer,
 *  feature) because the deduction engine claims its own idempotency at that
 *  same granularity: one request touching two features is two mutations. */
export const buildShadowEventId = ({
	type,
	orgId,
	env,
	customerId,
	featureId,
	idempotencyKey,
}: Omit<ShadowTapParams, "value"> & { type: MeteringEventType }): string => {
	const digest = createHash("sha256")
		.update(`${orgId}:${env}:${customerId}:${featureId}:${idempotencyKey}`)
		.digest("base64url");

	return `${EVENT_ID_PREFIX[type]}_${digest.slice(0, EVENT_ID_HASH_LENGTH)}`;
};

/**
 * Returns `null` for anything the v1 event schema would reject, refunds
 * (negative track values) and missing identifiers among them. The tap drops
 * those silently rather than letting a parse error near the serving path.
 *
 * For a reset, `value` is the amount the balance resets to. The fold ignores
 * it (a reset restores the meter's granted total), but the v1 schema still
 * demands a positive value, so a reset back to zero cannot be represented and
 * is dropped here.
 */
export const buildShadowEvent = ({
	type,
	orgId,
	env,
	customerId,
	featureId,
	value,
	idempotencyKey,
	eventTs = Date.now(),
}: ShadowTapParams & {
	type: MeteringEventType;
	eventTs?: number;
}): MeteringEvent | null => {
	if (!orgId || !env || !customerId || !featureId || !idempotencyKey) {
		return null;
	}
	if (!Number.isFinite(value) || value <= 0) return null;

	return {
		v: 1,
		id: buildShadowEventId({
			type,
			orgId,
			env,
			customerId,
			featureId,
			idempotencyKey,
		}),
		type,
		org_id: orgId,
		env,
		customer_id: customerId,
		feature_id: featureId,
		value,
		event_ts: eventTs,
	};
};
