import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { propertiesSchema } from "../../../models/common/json.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";
import { workerLockSchema } from "../../../models/subject/rows/workerLock.js";

/**
 * Settles an open lock at a final value. The lock row rides on the command because memory holds only its
 * ids: the server read it to find the customer, and a lock row is never edited, so the copy cannot be stale.
 */
export const finalizeCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("finalize"),
		org: commandOrgSchema,
		lock: workerLockSchema,
		/** The locked feature's catalog internal id; a confirm above the lock attributes credit usage under it. */
		internalFeatureId: nonEmptyStringSchema,
		/** What the lock is settled at, in the feature's units: 0 releases it, null confirms it at what it took. */
		finalValue: finiteNumberSchema.nullable(),
		/** Overrides the lock's own properties on whatever the finalize deducts. */
		properties: propertiesSchema,
	})
	.strict();

export type FinalizeCommand = z.infer<typeof finalizeCommandSchema>;
