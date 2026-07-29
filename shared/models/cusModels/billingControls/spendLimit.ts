import { z } from "zod/v4";

export const SpendLimitType = z.enum(["absolute", "usage_percentage"]);
export type SpendLimitType = z.infer<typeof SpendLimitType>;

export const DbSpendLimitSchema = z
	.object({
		feature_id: z.string().optional().meta({
			description: "Optional feature ID this spend limit applies to.",
		}),
		enabled: z.boolean().default(false).meta({
			description: "Whether the overage spend limit is enabled.",
		}),
		limit_type: SpendLimitType.optional().meta({
			description:
				"How overage_limit is interpreted: an absolute overage cap (default) or a percentage of the main-plan allowance.",
		}),
		overage_limit: z.number().min(0).optional().meta({
			description:
				"Overage cap for the feature: absolute units, or a percent (e.g. 120) when limit_type is usage_percentage.",
		}),
		skip_overage_billing: z.boolean().optional().meta({
			description:
				"When true, overage for this feature is not posted to Stripe. Usage tracking and balance resets still behave normally.",
		}),
	})
	.refine(
		(data) =>
			(data.overage_limit === undefined &&
				data.skip_overage_billing === undefined) ||
			data.feature_id !== undefined,
		{
			message:
				"feature_id is required when overage_limit or skip_overage_billing is provided",
			path: ["feature_id"],
		},
	);

export type DbSpendLimit = z.infer<typeof DbSpendLimitSchema>;

export const pickStricterSpendLimit = (
	left: DbSpendLimit,
	right: DbSpendLimit,
): DbSpendLimit => {
	if (left.enabled !== right.enabled) return left.enabled ? left : right;
	const leftLimit = left.overage_limit ?? Number.POSITIVE_INFINITY;
	const rightLimit = right.overage_limit ?? Number.POSITIVE_INFINITY;
	return rightLimit < leftLimit ? right : left;
};
