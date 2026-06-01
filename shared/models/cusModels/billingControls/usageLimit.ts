import { z } from "zod/v4";
import { EntInterval } from "../../productModels/intervals/entitlementInterval.js";

/**
 * A hard, windowed usage cap on a feature (the second limit dimension on top
 * of the balance). Unlike `spend_limit` (which caps overage on the credit pool),
 * this caps how much of a feature can be used within a recurring window,
 * regardless of remaining balance.
 *
 * A `feature_id` of a metered member feature caps that feature's usage (e.g.
 * "max 5 workflows/month") even while credits remain; a `feature_id` of a
 * credit-system feature caps the pool itself within the window (e.g. "max 3
 * credits/day").
 *
 * The enforced value is resolved at deduction time; the counter state lives in
 * `customer_entitlements.usage_windows`.
 */
export const DbUsageLimitSchema = z.object({
	feature_id: z.string().meta({
		description: "Feature this usage-window cap applies to.",
	}),
	enabled: z.boolean().default(false).meta({
		description: "Whether this usage limit is enabled.",
	}),
	limit: z.number().min(0).meta({
		description: "Maximum usage allowed within each window.",
	}),
	interval: z.enum(EntInterval).meta({
		description: "The window interval the cap resets on.",
	}),
});

export type DbUsageLimit = z.infer<typeof DbUsageLimitSchema>;
