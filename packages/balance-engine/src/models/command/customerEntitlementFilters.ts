import { EntInterval } from "@autumn/shared";
import { z } from "zod/v4";
import { openEnum } from "../common/openSchema.js";
import { nonEmptyStringSchema } from "../common/primitives.js";

export const customerEntitlementFiltersSchema = z
	.object({
		cusEntIds: z.array(nonEmptyStringSchema).optional(),
		interval: openEnum({
			name: "customerEntitlementFilters.interval",
			values: Object.values(EntInterval),
		}).optional(),
		balanceId: nonEmptyStringSchema.optional(),
	})
	.loose();
