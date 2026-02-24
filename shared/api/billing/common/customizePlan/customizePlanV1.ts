import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice";
import { CreatePlanItemParamsV1Schema } from "@api/products/items/crud/createPlanItemParamsV1";
import { z } from "zod/v4";

export const CustomizePlanV1Schema = z
	.object({
		price: BasePriceParamsSchema.nullable().optional().meta({
			description:
				"Override the base price of the plan. Pass null to remove the base price.",
		}),
		items: z.array(CreatePlanItemParamsV1Schema).optional().meta({
			description: "Override the items in the plan.",
		}),
		free_trial: FreeTrialParamsV1Schema.nullable().optional().meta({
			description:
				"Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely.",
		}),
	})
	.refine(
		(data) =>
			data.items !== undefined ||
			data.price !== undefined ||
			data.free_trial !== undefined,
		{
			message:
				"When using customize, either items, price, or free_trial must be provided",
		},
	)
	.meta({
		title: "CustomizePlan",
		description:
			"Customize a plan by overriding its price, items, free trial, or a combination.",
	});

export type CustomizePlanV1 = z.infer<typeof CustomizePlanV1Schema>;

/** Returns true if customize has custom items or price (not just free_trial) */
export const hasCustomItems = (
	customize?: CustomizePlanV1,
): customize is CustomizePlanV1 => {
	if (!customize) return false;
	return customize.price !== undefined || customize.items !== undefined;
};
