import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1.js";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice.js";
import { CreatePlanItemParamsV1Schema } from "@api/products/items/crud/createPlanItemParamsV1.js";
import { CustomerBillingControlsParamsSchema } from "@models/cusModels/billingControls/customerBillingControls.js";
import { ProductConfigParamsSchema } from "@models/productModels/productConfig/productConfig.js";
import { ProductMetadataSchema } from "@models/productModels/productMetadata.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";

export const CatalogPlanVersioningStrategySchema = z.enum([
	"existing",
	"new_version",
	"all_versions",
]);

/**
 * CatalogV2 plan entry — create/update fields only.
 * Variants, licenses, and migration are rejected until those slices land.
 */
export const UpdateCatalogPlanParamsSchema = z.object({
	plan_id: z.string().nonempty().regex(idRegex).meta({
		description: "The ID of the plan to create or update.",
	}),
	new_plan_id: z.string().nonempty().regex(idRegex).optional().meta({
		description:
			"Rename the plan to this id. Blocked when any customer or reward program references it.",
	}),
	version: z.number().int().min(1).optional().meta({
		description:
			"Explicit version row this entry declares — an existing row to edit, or a version to create (versions must stay contiguous from 1). Repeat plan_id with different versions to declare multiple rows; at most one entry per plan_id may omit version (targets latest).",
	}),
	versioning: CatalogPlanVersioningStrategySchema.optional().meta({
		description:
			"How this entry applies across versions. Omit or `existing` = the resolved row only; `all_versions` = also apply to every other existing version of this plan; `new_version` is not implemented yet.",
	}),

	name: z.string().nonempty().optional().meta({
		description: "Display name of the plan. Required when creating.",
	}),
	description: z.string().nullable().optional().meta({
		description: "Optional description of the plan.",
	}),
	group: z.string().optional().meta({
		description: "Group identifier for mutually exclusive plans.",
	}),
	add_on: z.boolean().optional().meta({
		description: "Whether the plan is an add-on.",
	}),
	auto_enable: z.boolean().optional().meta({
		description: "Whether the plan is automatically enabled for new customers.",
	}),
	is_default: z.boolean().optional().meta({
		description: "Whether this is the org's default plan.",
	}),
	archived: z.boolean().optional().meta({
		description: "Archive or unarchive the plan.",
	}),

	price: BasePriceParamsSchema.nullable().optional().meta({
		description:
			"Base recurring price. Omit to leave unchanged; null removes it.",
	}),
	items: z.array(CreatePlanItemParamsV1Schema).optional().meta({
		description: "Feature configurations for this plan.",
	}),
	free_trial: FreeTrialParamsV1Schema.nullable().optional().meta({
		description: "Free trial. Omit to leave unchanged; null removes it.",
	}),
	config: ProductConfigParamsSchema.optional().meta({
		description: "Miscellaneous plan-level configuration flags.",
	}),
	billing_controls: CustomerBillingControlsParamsSchema.optional().meta({
		description: "Plan-level billing controls used as customer defaults.",
	}),
	metadata: ProductMetadataSchema.optional().meta({
		description: "Arbitrary key-value metadata shared across all versions.",
	}),
	create_in_stripe: z.boolean().optional().meta({
		internal: true,
		description: "When false, skip Stripe product/price creation on create.",
	}),
});

export type UpdateCatalogPlanParams = z.infer<
	typeof UpdateCatalogPlanParamsSchema
>;
export type UpdateCatalogPlanParamsInput = z.input<
	typeof UpdateCatalogPlanParamsSchema
>;
