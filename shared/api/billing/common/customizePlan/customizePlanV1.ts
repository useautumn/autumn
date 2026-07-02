import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice";
import { CreatePlanItemParamsV1Schema } from "@api/products/items/crud/createPlanItemParamsV1";
import { PlanItemFilterSchema } from "@api/products/items/filter/planItemFilter";
import { CustomerBillingControlsParamsSchema } from "@models/cusModels/billingControls/customerBillingControls";
import { CustomizePlanLicenseSchema } from "@models/licenseModels/licenseModels";
import { ResetInterval } from "@models/productModels/intervals/resetInterval";
import { z } from "zod/v4";

/** Deprecated: use remove_items and add_items to replace plan items. */
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

export type UpdatePlanItemParamsV1 = z.infer<
	typeof UpdatePlanItemParamsV1Schema
>;

type CustomizePlanRefinementData = {
	price?: unknown;
	items?: unknown;
	add_items?: unknown;
	remove_items?: unknown;
	update_items?: unknown;
	free_trial?: unknown;
	billing_controls?: unknown;
	licenses?: unknown;
};

export const refineCustomizePlanV1Schema = <
	TSchema extends z.ZodType<CustomizePlanRefinementData>,
>(
	schema: TSchema,
	{
		includeItems = true,
		includeFreeTrial = true,
		includeUpdateItems = true,
		includeLicenses = true,
	}: {
		includeItems?: boolean;
		includeFreeTrial?: boolean;
		includeUpdateItems?: boolean;
		includeLicenses?: boolean;
	} = {},
) =>
	schema
		.refine(
			(data) =>
				(includeItems && data.items !== undefined) ||
				data.price !== undefined ||
				(includeFreeTrial && data.free_trial !== undefined) ||
				data.add_items !== undefined ||
				data.remove_items !== undefined ||
				(includeUpdateItems && data.update_items !== undefined) ||
				data.billing_controls !== undefined ||
				(includeLicenses && data.licenses !== undefined),
			{
				message: `When using customize, at least one of ${[
					"price",
					includeItems ? "items" : null,
					"add_items",
					"remove_items",
					includeUpdateItems ? "deprecated update_items" : null,
					includeFreeTrial ? "free_trial" : null,
					"billing_controls",
					includeLicenses ? "licenses" : null,
				]
					.filter(Boolean)
					.join(", ")} must be provided`,
			},
		)
		.refine(
			(data) =>
				!(
					data.items !== undefined &&
					(data.add_items !== undefined ||
						data.remove_items !== undefined ||
						(includeUpdateItems && data.update_items !== undefined))
				),
			{
				message: `customize.items (PUT-style) cannot be combined with ${[
					"add_items",
					"remove_items",
					includeUpdateItems ? "deprecated update_items" : null,
				]
					.filter(Boolean)
					.join(" / ")} (PATCH-style); pick one approach`,
			},
		);

export const CustomizePlanV1BaseSchema = z.object({
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
	billing_controls: CustomerBillingControlsParamsSchema.optional().meta({
		description:
			"Override the plan's billing controls (auto top-ups, spend limits, usage limits, usage alerts, overage allowed) for this customer.",
	}),
	licenses: z.array(CustomizePlanLicenseSchema).optional().meta({
		description:
			"Override the plan's licenses for this customer. When provided, replaces the base plan license set.",
	}),
});

export const CustomizePlanV1Schema = refineCustomizePlanV1Schema(
	CustomizePlanV1BaseSchema,
).meta({
	title: "CustomizePlan",
	description:
		"Customize a plan by overriding its price, items, licenses, free trial, or a combination.",
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
