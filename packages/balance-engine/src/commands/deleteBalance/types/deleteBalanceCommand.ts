import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { customerEntitlementFiltersSchema } from "../../../models/command/customerEntitlementFilters.js";
import { nonEmptyStringSchema } from "../../../models/common/primitives.js";

export const deleteBalanceCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("deleteBalance"),
		org: commandOrgSchema,
		featureId: nonEmptyStringSchema.optional(),
		customerEntitlementFilters: customerEntitlementFiltersSchema.optional(),
		recalculate: z.boolean(),
	})
	.loose();

export type DeleteBalanceCommand = z.infer<typeof deleteBalanceCommandSchema>;
