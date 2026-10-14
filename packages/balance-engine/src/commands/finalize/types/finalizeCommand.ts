import { z } from "zod/v4";
import { atomSourceSchema } from "../../../models/command/atomSource.js";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { propertiesSchema } from "../../../models/common/json.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";
import { workerLockSchema } from "../../../models/subject/rows/workerLock.js";

/** Settles an open lock at a final value; the API passes the row it read, an Atom names the lock and Autumn settles its own row. */
export const finalizeCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("finalize"),
		org: commandOrgSchema,
		/** The row the API read; null on an Atom's finalize, which names `lockId` and is settled from Autumn's own state. */
		lock: workerLockSchema.nullable(),
		/** The caller's lock id, on an Atom's finalize. */
		lockId: nonEmptyStringSchema.optional(),
		/** The locked feature's catalog internal id; a confirm above the lock attributes credit usage under it. */
		internalFeatureId: nonEmptyStringSchema,
		/** What the lock is settled at, in the feature's units: 0 releases it, null confirms it at what it took. */
		finalValue: finiteNumberSchema.nullable(),
		/** Overrides the lock's own properties on whatever the finalize deducts. */
		properties: propertiesSchema,
		source: atomSourceSchema.optional(),
	})
	.loose()
	.refine(
		({ lock, lockId, source }) =>
			lock !== null || (source !== undefined && lockId !== undefined),
		{
			message: "Only an Atom's finalize names its lock by id instead of a row",
		},
	);

export type FinalizeCommand = z.infer<typeof finalizeCommandSchema>;
