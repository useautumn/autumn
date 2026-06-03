import { BillingMethod } from "@api/products/components/billingMethod";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { ResetInterval } from "@models/productModels/intervals/resetInterval";
import { z } from "zod/v4";

export const PlanItemFilterSchema = z
	.object({
		feature_id: z.string().optional().meta({
			description: "Match items linked to this feature.",
		}),
		billing_method: z.enum(BillingMethod).optional().meta({
			description:
				"Match items with this billing method (prepaid or usage_based).",
		}),
		interval: z
			.union([z.enum(BillingInterval), z.enum(ResetInterval)])
			.optional()
			.meta({
				description:
					"Match items with this interval. Accepts either a BillingInterval (price-side) or a ResetInterval (reset-side, includes day/hour/minute) so price-less items keyed by reset.interval can be disambiguated.",
			}),
		interval_count: z.number().int().positive().optional().meta({
			description:
				"Match items with this interval_count. Disambiguates between items that share an interval but differ in count.",
		}),
	})
	.refine(
		(filter) =>
			filter.feature_id !== undefined ||
			filter.billing_method !== undefined ||
			filter.interval !== undefined ||
			filter.interval_count !== undefined,
		{ message: "PlanItemFilter must have at least one field set." },
	)
	.meta({
		title: "PlanItemFilter",
		description:
			"Filter for matching plan items. All provided fields must match (AND).",
	});

export type PlanItemFilter = z.infer<typeof PlanItemFilterSchema>;
