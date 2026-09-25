import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { customerEntitlementFiltersSchema } from "../../../models/command/customerEntitlementFilters.js";
import { nonEmptyStringSchema } from "../../../models/common/primitives.js";

/** `balances.delete` decided on the worker's rows: the matching grants removed, their usage kept when asked. */
export const deleteBalanceCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("deleteBalance"),
		org: commandOrgSchema,
		/** Absent deletes the matching grants of every feature. */
		featureId: nonEmptyStringSchema.optional(),
		customerEntitlementFilters: customerEntitlementFiltersSchema.optional(),
		/** Keep the deleted grants' usage: drawn from the feature's other rows, or carried as overage. */
		recalculate: z.boolean(),
	})
	.strict();

export type DeleteBalanceCommand = z.infer<typeof deleteBalanceCommandSchema>;
