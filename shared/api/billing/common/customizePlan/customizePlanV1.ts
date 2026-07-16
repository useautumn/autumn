import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice";
import { CreatePlanItemParamsV1Schema } from "@api/products/items/crud/createPlanItemParamsV1";
import { PlanItemFilterSchema } from "@api/products/items/filter/planItemFilter";
import { CustomerBillingControlsParamsSchema } from "@models/cusModels/billingControls/customerBillingControls";
import {
	CustomizePlanLicenseSchema,
	licensePatchIssues,
} from "@models/licenseModels/licenseModels";
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
	upsert_licenses?: { license_plan_id: string }[];
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
) => {
	const enabledKeys = [
		"price",
		includeItems && "items",
		"add_items",
		"remove_items",
		includeUpdateItems && "update_items",
		includeFreeTrial && "free_trial",
		"billing_controls",
		includeLicenses && "upsert_licenses",
	].filter(Boolean) as (keyof CustomizePlanRefinementData)[];
	const keyLabel = (key: string) =>
		key === "update_items" ? "deprecated update_items" : key;

	return schema
		.refine((data) => enabledKeys.some((key) => data[key] !== undefined), {
			message: `When using customize, at least one of ${enabledKeys
				.map(keyLabel)
				.join(", ")} must be provided`,
		})
		.superRefine((data, refinementCtx) => {
			if (!includeLicenses) return;
			for (const issue of licensePatchIssues({
				upsertLicenses: data.upsert_licenses,
			})) {
				refinementCtx.addIssue({ code: "custom", ...issue });
			}
		})
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
};

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
	upsert_licenses: z.array(CustomizePlanLicenseSchema).optional().meta({
		description:
			"License links to add or override for this customer, keyed by license_plan_id. Omitted fields inherit the plan catalog link (included defaults to 1 when the license is not in the catalog). A bare entry restores the license to pure catalog inheritance.",
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
