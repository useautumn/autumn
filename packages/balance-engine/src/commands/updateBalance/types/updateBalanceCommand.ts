import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { customerEntitlementFiltersSchema } from "../../../models/command/customerEntitlementFilters.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";

export const updateBalanceCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("updateBalance"),
		org: commandOrgSchema,
		featureId: nonEmptyStringSchema,
		internalFeatureId: nonEmptyStringSchema,
		customerEntitlementFilters: customerEntitlementFiltersSchema.optional(),
		remaining: finiteNumberSchema.optional(),
		usage: finiteNumberSchema.optional(),
		addToBalance: finiteNumberSchema.optional(),
		includedGrant: finiteNumberSchema.optional(),
		nextResetAt: timestampSchema.optional(),
		expiresAt: timestampSchema.optional(),
	})
	.loose();

export type UpdateBalanceCommand = z.infer<typeof updateBalanceCommandSchema>;
