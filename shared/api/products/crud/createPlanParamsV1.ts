import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1.js";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice.js";
import { CustomerBillingControlsParamsSchema } from "@models/cusModels/billingControls/customerBillingControls.js";
import { LinkPlanLicenseSchema } from "@models/licenseModels/licenseModels.js";
import { ProductConfigParamsSchema } from "@models/productModels/productConfig/productConfig.js";
import { ProductMetadataSchema } from "@models/productModels/productMetadata.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";
import { CreatePlanItemParamsV1Schema } from "../items/crud/createPlanItemParamsV1.js";

export const CreatePlanParamsV1Schema = z.object({
	id: z.string().nonempty().regex(idRegex).meta({
		description: "Unique identifier for the plan.",
	}),
	group: z.string().default("").meta({
		description:
			"Group identifier for organizing related plans. Plans in the same group are mutually exclusive.",
	}),

	name: z.string().nonempty().meta({
		description: "Display name of the plan.",
	}),
	description: z.string().nullable().default(null).meta({
		description: "Optional description of the plan.",
	}),

	add_on: z.boolean().default(false).meta({
		description:
			"If true, this plan can be attached alongside other plans. Otherwise, attaching replaces existing plans in the same group.",
	}),
	auto_enable: z.boolean().default(false).meta({
		description:
			"If true, plan is automatically attached when a customer is created. Use for free tiers.",
	}),

	price: BasePriceParamsSchema.optional().meta({
		description:
			"Base recurring price for the plan. Omit for free or usage-only plans.",
	}),

	items: z.array(CreatePlanItemParamsV1Schema).optional().meta({
		description:
			"Feature configurations for this plan. Each item defines included units, pricing, and reset behavior.",
	}),
	// internal: dashboard-only license catalog surface, not part of the public plan API yet.
	licenses: z.array(LinkPlanLicenseSchema).optional().meta({
		internal: true,
		description:
			"Plans offered as assignable licenses under this plan. The full set replaces existing links.",
	}),
	free_trial: FreeTrialParamsV1Schema.optional().meta({
		description:
			"Free trial configuration. Customers can try this plan before being charged.",
	}),
	config: ProductConfigParamsSchema.optional().meta({
		description: "Miscellaneous plan-level configuration flags.",
	}),
	billing_controls: CustomerBillingControlsParamsSchema.optional().meta({
		description: "Plan-level billing controls used as customer defaults.",
	}),

	metadata: ProductMetadataSchema.optional().meta({
		description:
			"Arbitrary key-value metadata defined by you for your own use (e.g. UI copy, feature highlights). Values can be any JSON-serializable value. Shared across all versions of the plan.",
	}),

	create_in_stripe: z.boolean().default(true).meta({
		internal: true,
	}),
});

export const CreatePlanParamsV2Schema = z
	.object({
		plan_id: z.string().nonempty().regex(idRegex).meta({
			description: "The ID of the plan to create.",
		}),
	})
	.extend(CreatePlanParamsV1Schema.omit({ id: true }).shape);

export type CreatePlanParams = z.infer<typeof CreatePlanParamsV1Schema>;
export type CreatePlanParamsInput = z.input<typeof CreatePlanParamsV1Schema>;
export type CreatePlanParamsV2 = z.infer<typeof CreatePlanParamsV2Schema>;
export type CreatePlanParamsV2Input = z.input<typeof CreatePlanParamsV2Schema>;
