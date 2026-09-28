import { EntInterval } from "@autumn/shared";
import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

/** Narrows a balance command to one balance, customer entitlement or reset interval. */
export const customerEntitlementFiltersSchema = z
	.object({
		cusEntIds: z.array(nonEmptyStringSchema).optional(),
		interval: z.enum(EntInterval).optional(),
		balanceId: nonEmptyStringSchema.optional(),
	})
	.strict();
