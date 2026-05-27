import { BillingMethod } from "@api/products/components/billingMethod";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { EntInterval } from "@models/productModels/intervals/entitlementInterval";
import { z } from "zod/v4";

const billingSet = new Set<string>(Object.values(BillingInterval));
const AllIntervals = [
	...Object.values(BillingInterval),
	...Object.values(EntInterval).filter((v) => !billingSet.has(v)),
] as [string, ...string[]];

export const PlanItemFilterSchema = z
	.object({
		feature_id: z.string().optional().meta({
			description: "Match items linked to this feature.",
		}),
		billing_method: z.enum(BillingMethod).optional().meta({
			description:
				"Match items with this billing method (prepaid or usage_based).",
		}),
		interval: z.enum(AllIntervals).optional().meta({
			description: "Match items with this interval.",
		}),
	})
	.refine(
		(filter) =>
			filter.feature_id !== undefined ||
			filter.billing_method !== undefined ||
			filter.interval !== undefined,
		{ message: "PlanItemFilter must have at least one field set." },
	)
	.meta({
		title: "PlanItemFilter",
		description:
			"Filter for matching plan items. All provided fields must match (AND).",
	});

export type PlanItemFilter = z.infer<typeof PlanItemFilterSchema>;
