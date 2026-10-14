import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { propertiesSchema } from "../../../models/common/json.js";
import { openEnum } from "../../../models/common/openSchema.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";

export const overageBehaviorSchema = openEnum({
	name: "track.overageBehavior",
	values: ["cap", "reject", "overflow"],
});

export type OverageBehavior = z.infer<typeof overageBehaviorSchema>;

export const trackLockSchema = z
	.object({
		id: nonEmptyStringSchema,
		lockId: nonEmptyStringSchema,
		expiresAt: timestampSchema,
		expiryAction: openEnum({
			name: "track.lock.expiryAction",
			values: ["release", "confirm"],
		}),
	})
	.loose();

export type TrackLock = z.infer<typeof trackLockSchema>;

export const trackIdempotencySchema = z
	.object({
		key: nonEmptyStringSchema,
		ttlMs: z.number().int().positive(),
	})
	.loose();

export type TrackIdempotency = z.infer<typeof trackIdempotencySchema>;

export const trackUsageEventSchema = z
	.object({
		name: nonEmptyStringSchema,
		idempotencyKey: nonEmptyStringSchema.nullable(),
		id: nonEmptyStringSchema.nullable(),
		recordsCreditCost: z.boolean().optional(),
	})
	.loose();

export type TrackUsageEvent = z.infer<typeof trackUsageEventSchema>;

export const trackCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("track"),
		org: commandOrgSchema,
		featureId: nonEmptyStringSchema,
		internalFeatureId: nonEmptyStringSchema,
		value: finiteNumberSchema,
		overageBehavior: overageBehaviorSchema,
		properties: propertiesSchema,
		lock: trackLockSchema.optional(),
		enforceOverdueBlock: z.boolean().optional(),
		idempotency: trackIdempotencySchema.optional(),
		usageEvent: trackUsageEventSchema.nullable(),
		receipt: z.never().optional(),
	})
	.loose();

export type TrackCommand = z.infer<typeof trackCommandSchema>;
