import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { customerEntitlementFiltersSchema } from "../../../models/command/customerEntitlementFilters.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";

/** `balances.update` decided on the worker's state: each field sets one thing on the feature's own rows. */
export const updateBalanceCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("updateBalance"),
		org: commandOrgSchema,
		featureId: nonEmptyStringSchema,
		/** The feature's catalog internal id. */
		internalFeatureId: nonEmptyStringSchema,
		customerEntitlementFilters: customerEntitlementFiltersSchema.optional(),
		/** The balance the feature's own rows should sum to. */
		remaining: finiteNumberSchema.optional(),
		/** Read as a target: the rows' grant plus prepaid quantity, less this. */
		usage: finiteNumberSchema.optional(),
		/** Drawn like a track, negative adds; ignored when a target is set. */
		addToBalance: finiteNumberSchema.optional(),
		/** The grant the feature's own rows should sum to; the balance stays, so usage moves. */
		includedGrant: finiteNumberSchema.optional(),
		/** Moves the soonest reset among the feature's own rows. */
		nextResetAt: timestampSchema.optional(),
		/** Sets the soonest expiry among the feature's own rows. */
		expiresAt: timestampSchema.optional(),
	})
	.strict();

export type UpdateBalanceCommand = z.infer<typeof updateBalanceCommandSchema>;
