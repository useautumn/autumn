import { z } from "zod/v4";
import { propertiesSchema } from "../common/json.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../common/primitives.js";
import { atomSourceSchema } from "./atomSource.js";
import { mutatingCommandSchema } from "./baseCommand.js";
import { commandOrgSchema } from "./commandOrg.js";

/**
 * An Atom settles a lock it took, naming it as the API does: the identity's customer and entity, the lock id and
 * its feature. Never decided as itself: the worker settles Autumn's own row with a finalize, then lands the seq.
 */
export const atomFinalizeCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("atomFinalize"),
		org: commandOrgSchema,
		lockId: nonEmptyStringSchema,
		featureId: nonEmptyStringSchema,
		/** The feature's catalog internal id, as a track carries it. */
		internalFeatureId: nonEmptyStringSchema,
		/** 0 releases the lock, null confirms it at what it took. */
		finalValue: finiteNumberSchema.nullable(),
		/** Overrides the lock's own properties on whatever the finalize deducts. */
		properties: propertiesSchema,
		source: atomSourceSchema,
	})
	.loose();

export type AtomFinalizeCommand = z.infer<typeof atomFinalizeCommandSchema>;
