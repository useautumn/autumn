import { createHash } from "node:crypto";
import type { MeteringEvent } from "../events/meteringEventSchema.js";

const EVENT_ID_PREFIX = "shd";
const EVENT_ID_HASH_LENGTH = 32;

export type ShadowDeductParams = {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	value: number;
	idempotencyKey: string;
};

/** Derived, never random: a redelivered or retried track carries the same
 *  idempotency key, so the mirrored event keeps the same id and the metering
 *  fold dedupes it instead of double-counting. Scoped per (org, env, customer,
 *  feature) because the deduction engine claims its own idempotency at that
 *  same granularity: one request touching two features is two deductions. */
export const buildShadowDeductEventId = ({
	orgId,
	env,
	customerId,
	featureId,
	idempotencyKey,
}: Omit<ShadowDeductParams, "value">): string => {
	const digest = createHash("sha256")
		.update(`${orgId}:${env}:${customerId}:${featureId}:${idempotencyKey}`)
		.digest("base64url");

	return `${EVENT_ID_PREFIX}_${digest.slice(0, EVENT_ID_HASH_LENGTH)}`;
};

/** Returns `null` for anything the v1 event schema would reject, refunds
 *  (negative track values) and missing identifiers among them. The tap drops
 *  those silently rather than letting a parse error near the serving path. */
export const buildShadowDeductEvent = ({
	orgId,
	env,
	customerId,
	featureId,
	value,
	idempotencyKey,
	eventTs = Date.now(),
}: ShadowDeductParams & { eventTs?: number }): MeteringEvent | null => {
	if (!orgId || !env || !customerId || !featureId || !idempotencyKey) {
		return null;
	}
	if (!Number.isFinite(value) || value <= 0) return null;

	return {
		v: 1,
		id: buildShadowDeductEventId({
			orgId,
			env,
			customerId,
			featureId,
			idempotencyKey,
		}),
		type: "deduct",
		org_id: orgId,
		env,
		customer_id: customerId,
		feature_id: featureId,
		value,
		event_ts: eventTs,
	};
};
