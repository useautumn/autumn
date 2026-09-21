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
	})
	.strict();

export type TrackCommand = z.infer<typeof trackCommandSchema>;
