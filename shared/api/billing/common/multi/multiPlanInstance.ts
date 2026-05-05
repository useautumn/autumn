import { CustomizePlanV1Schema } from "@api/billing/common/customizePlan/customizePlanV1";
import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0";
import { z } from "zod/v4";

/**
 * Per-plan attach intent shared across multi-plan billing actions
 * (sync, multi-attach, create-schedule, future actions).
 *
 * Identifies one Autumn plan to attach plus optional per-plan overrides.
 * Action-specific fields (entity binding, expire flags, subscription
 * targeting, etc.) live on extending schemas.
 */
export const MultiPlanInstanceSchema = z
	.object({
		plan_id: z.string().meta({
			description: "Autumn plan id to attach.",
		}),
		version: z.number().optional().meta({
			description: "Optional explicit plan version.",
		}),
		customize: CustomizePlanV1Schema.optional().meta({
			description:
				"Override the plan's price, items, or free trial. Wins over anything detection inferred for the same plan.",
		}),
		feature_quantities: z.array(FeatureQuantityParamsV0Schema).optional().meta({
			description:
				"Prepaid feature quantities to set on the resulting customer product.",
		}),
	})
	.meta({
		title: "MultiPlanInstance",
		description:
			"Per-plan attach intent shared across multi-plan billing actions.",
	});

export type MultiPlanInstance = z.infer<typeof MultiPlanInstanceSchema>;
