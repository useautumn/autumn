import { z } from "zod/v4";
import { atomSourceSchema } from "../../../models/command/atomSource.js";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { propertiesSchema } from "../../../models/common/json.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";

/**
 * An Atom settles a lock it took, naming it as the API does: the identity's customer and entity, the lock id and its feature.
 * Not a MutatingCommand: it is logged as the finalize or the track of nothing it decides into, so every log reader is unchanged.
 */
export const atomFinalizeCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("atomFinalize"),
		org: commandOrgSchema,
		lockId: nonEmptyStringSchema,
		/** Null when the Atom journaled the finalize undecided: Autumn's own row names the feature, and its overage behaviour governs. */
		featureId: nonEmptyStringSchema.nullable(),
		/** The feature's catalog internal id, as a track carries it; null with `featureId`, the row read back carrying it instead. */
		internalFeatureId: nonEmptyStringSchema.nullable(),
		/** 0 releases the lock, null confirms it at what it took. */
		finalValue: finiteNumberSchema.nullable(),
		/** Overrides the lock's own properties on whatever the finalize deducts. */
		properties: propertiesSchema,
		source: atomSourceSchema,
	})
	.loose();

export type AtomFinalizeCommand = z.infer<typeof atomFinalizeCommandSchema>;
