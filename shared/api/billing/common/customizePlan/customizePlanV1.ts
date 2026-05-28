import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice";
import { CreatePlanItemParamsV1Schema } from "@api/products/items/crud/createPlanItemParamsV1";
import { PlanItemFilterSchema } from "@api/products/items/filter/planItemFilter";
import { ResetInterval } from "@models/productModels/intervals/resetInterval";
import { z } from "zod/v4";

export const UpdatePlanItemParamsV1Schema = z
	.object({
		filter: PlanItemFilterSchema.meta({
			description:
				"Filter selecting which existing plan item(s) to update. Same shape as remove_items filters.",
		}),
		included: z.number().nonnegative().optional().meta({
			description:
				"Override the matched item's included usage / allowance. Existing usage carries forward.",
		}),
		interval: z.enum(ResetInterval).optional().meta({
			description:
				"Override the matched item's reset interval. Use 'one_off' for non-resetting balances.",
		}),
		})
		.meta({
			title: "UpdatePlanItem",
			description:
				"Deprecated. Use remove_items and add_items to replace plan items.",
			deprecated: true,
		});

export type UpdatePlanItemParamsV1 = z.infer<typeof UpdatePlanItemParamsV1Schema>;

export const CustomizePlanV1Schema = z
	.object({
		price: BasePriceParamsSchema.nullable().optional().meta({
			description:
				"Override the base price of the plan. Pass null to remove the base price.",
		}),
			items: z.array(CreatePlanItemParamsV1Schema).optional().meta({
				description:
					"Override the items in the plan (PUT-style — replaces all existing items). Mutually exclusive with add_items / remove_items / deprecated update_items.",
			}),
		add_items: z.array(CreatePlanItemParamsV1Schema).optional().meta({
			description: "Items to add to the plan.",
		}),
		remove_items: z.array(PlanItemFilterSchema).optional().meta({
			description: "Filters selecting items to remove from the plan.",
		}),
			update_items: z.array(UpdatePlanItemParamsV1Schema).optional().meta({
				description:
					"Deprecated. Use remove_items and add_items to replace matched plan items.",
				internal: true,
				deprecated: true,
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
			data.free_trial !== undefined ||
			data.add_items !== undefined ||
			data.remove_items !== undefined ||
			data.update_items !== undefined,
			{
				message:
					"When using customize, at least one of price, items, add_items, remove_items, deprecated update_items, or free_trial must be provided",
			},
	)
	.refine(
		(data) =>
			!(
				data.items !== undefined &&
				(data.add_items !== undefined ||
					data.remove_items !== undefined ||
					data.update_items !== undefined)
			),
			{
				message:
					"customize.items (PUT-style) cannot be combined with add_items / remove_items / deprecated update_items (PATCH-style); pick one approach",
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
	return (
		customize.price !== undefined ||
		customize.items !== undefined ||
		customize.add_items !== undefined ||
		customize.remove_items !== undefined ||
		customize.update_items !== undefined
	);
};

export const isCustomizePlanPatchStyle = (
	customize?: CustomizePlanV1,
): customize is CustomizePlanV1 =>
	customize?.items === undefined &&
	(customize?.price !== undefined ||
		customize?.add_items !== undefined ||
		customize?.remove_items !== undefined ||
		customize?.update_items !== undefined);
