import { z } from "zod/v4";
import { DbUsageLimitSchema } from "../../models/cusModels/billingControls/usageLimit.js";

/**
 * Response variant of a usage limit: the stored config plus the usage already
 * consumed in the active window (read from the usage-window counter).
 */
export const ApiUsageLimitSchema = DbUsageLimitSchema.extend({
	usage: z.number().min(0).optional().meta({
		description:
			"Current usage already consumed in the active interval. Response-only; not stored on billing controls.",
	}),
});

export type ApiUsageLimit = z.infer<typeof ApiUsageLimitSchema>;
