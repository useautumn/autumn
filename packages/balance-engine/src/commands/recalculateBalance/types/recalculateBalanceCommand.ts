import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { customerEntitlementFiltersSchema } from "../../../models/command/customerEntitlementFilters.js";
import { nonEmptyStringSchema } from "../../../models/common/primitives.js";

export const recalculateBalanceCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("recalculateBalance"),
		org: commandOrgSchema,
		featureId: nonEmptyStringSchema,
		internalFeatureId: nonEmptyStringSchema,
		customerEntitlementFilters: customerEntitlementFiltersSchema.optional(),
		preview: z.boolean(),
	})
	.loose();

export type RecalculateBalanceCommand = z.infer<
	typeof recalculateBalanceCommandSchema
>;
