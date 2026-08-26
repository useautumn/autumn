import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1.js";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice.js";
import { ApiPlanProcessorsSchema } from "@api/products/components/processors.js";
import { PlanLicenseParamsSchema } from "@api/products/crud/licenses/planLicenseParams.js";
import { MigrationParamsSchema } from "@api/products/crud/migrationParams.js";
import { CreatePlanItemParamsV1Schema } from "@api/products/items/crud/createPlanItemParamsV1.js";
import { CustomerBillingControlsParamsSchema } from "@models/cusModels/billingControls/customerBillingControls.js";
import { ProductConfigParamsSchema } from "@models/productModels/productConfig/productConfig.js";
import { ProductMetadataSchema } from "@models/productModels/productMetadata.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";
import { CatalogPlanVersioningStrategySchema } from "../versioning.js";
import { CatalogPropagateParamsSchema } from "./catalogPropagateParams.js";
import {
	CatalogBaseVariantIdSchema,
	CatalogVariantParamsSchema,
} from "./catalogVariantParams.js";

/** CatalogV2 plan entry — create/update fields only. */
export const UpdateCatalogPlanParamsSchema = z.object({
	// ── Core ──────────────────────────────────────────────────────────────
	plan_id: z.string().nonempty().regex(idRegex).meta({
		description: "The ID of the plan to create or update.",
	}),
	new_plan_id: z.string().nonempty().regex(idRegex).optional().meta({
		description:
			"Rename the plan to this id. Blocked when any customer or reward program references it.",
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
	active: z.boolean().optional().meta({
		description:
			"Take the active pointer. On `new_version`, omit to mint a draft; `true` promotes the minted row immediately.",
	}),
	processors: ApiPlanProcessorsSchema.optional().meta({
		description:
			"Payment processors this plan is connected to. Omit to keep.",
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

	// ── Catalog update ────────────────────────────────────────────────────
	version: z.number().int().min(1).optional().meta({
		description:
			"Deprecated. Use `version_slug` to target a row. Omit both to target the active row.",
		deprecated: true,
	}),
	version_slug: z.string().nonempty().regex(idRegex).optional().meta({
		description:
			"Target this version row by slug. At most one of `version` / `version_slug`; omit both to target the active row.",
	}),
	new_version_slug: z.string().nonempty().regex(idRegex).optional().meta({
		description:
			"Set or rename this row's version slug. On `new_version`, stamps the minted row (default `v{n}`).",
	}),
	versioning: CatalogPlanVersioningStrategySchema.optional().meta({
		description:
			"How this entry applies across versions. Omit or `existing` = the resolved row only; `all_versions` = also apply to every other existing version of this plan; `new_version` = mint max+1 as a draft unless `active` is true (customers stay on old).",
	}),
	propagate: CatalogPropagateParamsSchema.optional().meta({
		internal: true,
		description:
			"Who follows this plan's content change. Relatives not listed are frozen. Presence in this object is follow; customize overlays live on `variants[]` / `licenses[]` (not nested here).",
	}),
	migration: MigrationParamsSchema.optional().meta({
		description:
			"When draft is true, create a migration for customers on this plan after an in-place / all_versions update. Rejected with new_version — minting a version opts out of propagating to existing customers.",
	}),
	create_in_stripe: z.boolean().optional().meta({
		internal: true,
		description: "When false, skip Stripe product/price creation on create.",
	}),

	// ── Variants & licenses ───────────────────────────────────────────────
	variants: z.array(CatalogVariantParamsSchema).optional().meta({
		internal: true,
		description:
			"Declared overlays on variants of this plan. Omit to leave them unchanged. Follow is `propagate.variants`, not presence here.",
	}),
	licenses: z.array(PlanLicenseParamsSchema).optional().meta({
		internal: true,
		description:
			"Plans offered as assignable licenses under this plan. Omit to leave them unchanged.",
	}),
	base_variant_id: CatalogBaseVariantIdSchema.meta({
		internal: true,
		description:
			"Base plan id to attach this plan to. `null` detaches it from its base. Omit to leave the pointer unchanged. Nesting under the base's variants[] also links.",
	}),
}).refine(
	(data) => data.version === undefined || data.version_slug === undefined,
	{
		message:
			"Cannot specify both version and version_slug. Use one, or omit both to target the active row.",
		path: ["version_slug"],
	},
);

export type UpdateCatalogPlanParams = z.infer<
	typeof UpdateCatalogPlanParamsSchema
>;
export type UpdateCatalogPlanParamsInput = z.input<
	typeof UpdateCatalogPlanParamsSchema
>;
