import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { customerEntitlementFiltersSchema } from "../../../models/command/customerEntitlementFilters.js";
import { nonEmptyStringSchema } from "../../../models/common/primitives.js";

/** The dashboard's "Recalculate balances": a feature's grants reset, then their usage drawn back across them. */
export const recalculateBalanceCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("recalculateBalance"),
		org: commandOrgSchema,
		featureId: nonEmptyStringSchema,
		/** The feature's catalog internal id. */
		internalFeatureId: nonEmptyStringSchema,
		customerEntitlementFilters: customerEntitlementFiltersSchema.optional(),
		/** Answer with the diff and write nothing. */
		preview: z.boolean(),
	})
	.strict();

export type RecalculateBalanceCommand = z.infer<
	typeof recalculateBalanceCommandSchema
>;
