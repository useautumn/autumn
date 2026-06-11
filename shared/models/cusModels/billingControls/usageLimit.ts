import { z } from "zod/v4";
import { ResetInterval } from "../../productModels/intervals/resetInterval.js";

/**
 * A windowed hard usage cap on one feature: at most `limit` units per
 * `interval` window. Stored on the customer's `usage_limits` billing-control
 * column; an entry's presence arms the cap. Enforcement happens in the
 * deduction script against customer-scoped usage-window counters.
 */
export const DbUsageLimitSchema = z
	.object({
		feature_id: z.string().meta({
			description: "The feature this usage limit applies to.",
		}),
		limit: z.number().min(0).meta({
			description: "Maximum units allowed per window.",
		}),
		interval: z.enum(ResetInterval).meta({
			description:
				"Window interval for the cap, aligned to the customer's billing cycle.",
		}),
	})
	.refine((data) => data.interval !== ResetInterval.OneOff, {
		message: "interval cannot be one_off for a usage limit",
		path: ["interval"],
	});

export type DbUsageLimit = z.infer<typeof DbUsageLimitSchema>;
