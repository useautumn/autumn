import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { propertiesSchema } from "../../../models/common/json.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";

export const overageBehaviorSchema = z.enum(["cap", "reject", "overflow"]);

export type OverageBehavior = z.infer<typeof overageBehaviorSchema>;

/** Keeps this track's deduction open to a later finalize. The server names the row and decides what expiry does. */
export const trackLockSchema = z
	.object({
		/** The balance_locks row id. */
		id: nonEmptyStringSchema,
		/** The caller's id, unique among the customer's open locks. */
		lockId: nonEmptyStringSchema,
		expiresAt: timestampSchema,
		expiryAction: z.enum(["release", "confirm"]),
	})
	.strict();

export type TrackLock = z.infer<typeof trackLockSchema>;

/** A body key the consumer claims, not the API: a queued batch item. Absent when the API already claimed it. */
export const trackIdempotencySchema = z
	.object({
		/** Already namespaced (`track:<key>`), so it hashes to the same storage key the API would use. */
		key: nonEmptyStringSchema,
		ttlMs: z.number().int().positive(),
	})
	.strict();

export type TrackIdempotency = z.infer<typeof trackIdempotencySchema>;

/** The one usage event a track request records, named the way the legacy event row is. */
export const trackUsageEventSchema = z
	.object({
		/** The request's feature id, or its event name when it named an event instead. */
		name: nonEmptyStringSchema,
	})
	.strict();

export type TrackUsageEvent = z.infer<typeof trackUsageEventSchema>;

export const trackCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("track"),
		org: commandOrgSchema,
		featureId: nonEmptyStringSchema,
		/** The feature's catalog internal id; credit usage is attributed under it. */
		internalFeatureId: nonEmptyStringSchema,
		value: finiteNumberSchema,
		overageBehavior: overageBehaviorSchema,
		properties: propertiesSchema,
		lock: trackLockSchema.optional(),
		/** A check that deducts honours the org's overdue block, as a plain check does; a plain track does not. */
		enforceOverdueBlock: z.boolean().optional(),
		idempotency: trackIdempotencySchema.optional(),
		/** Null when this command records none: the caller skipped it, or a fan-out already records it on its first feature. */
		usageEvent: trackUsageEventSchema.nullable(),
	})
	.strict();

export type TrackCommand = z.infer<typeof trackCommandSchema>;
