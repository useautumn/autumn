import { CustomerBillingControlsSchema } from "@models/cusModels/billingControls/customerBillingControls.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { ProductConfigSchema } from "@models/productModels/productConfig/productConfig.js";
import { ProductMetadataSchema } from "@models/productModels/productMetadata.js";
import { z } from "zod/v4";
import { AdditionalCurrencyPriceArraySchema } from "./components/additionalCurrencies.js";
import { ApiFreeTrialV2Schema } from "./components/apiFreeTrialV2.js";
import { CustomerEligibilitySchema } from "./components/customerEligibility.js";
import { DisplaySchema } from "./components/display.js";
import {
	ApiPlanProcessorsSchema,
	ApiPriceProcessorsSchema,
} from "./components/processors.js";
import {
	API_PLAN_ITEM_PREPAID_EXAMPLE,
	API_PLAN_ITEM_USAGE_BASED_EXAMPLE,
	ApiPlanItemV1Schema,
} from "./items/apiPlanItemV1.js";
import { ApiPlanLicenseV1Schema } from "./apiPlanLicenseV1.js";
import {
	ApiPlanVariantV1Schema,
	VariantCustomizeSchema,
} from "./apiPlanVariantV1.js";

export {
	ApiPlanLicenseV1Schema,
	type ApiPlanLicenseV1,
} from "./apiPlanLicenseV1.js";
export {
	ApiPlanVariantV1Schema,
	type ApiPlanVariantV1,
	VariantCustomizeSchema,
} from "./apiPlanVariantV1.js";

export {
	AttachAction,
	type CustomerEligibility,
	CustomerEligibilitySchema,
	EligibilityStatus,
} from "./components/customerEligibility.js";

export const API_PLAN_V1_EXAMPLE = {
	id: "pro",
	name: "Pro Plan",
	description: null,
	group: null,
	version: 1,
	version_slug: "v1",
	active: true,
	addOn: false,
	autoEnable: false,
	price: {
		amount: 10,
		interval: "month",
		display: {
			primaryText: "$10",
			secondaryText: "per month",
		},
	},
	items: [API_PLAN_ITEM_USAGE_BASED_EXAMPLE, API_PLAN_ITEM_PREPAID_EXAMPLE],
	createdAt: 1771513979217,
	env: "sandbox",
	archived: false,
	baseVariantId: null,
	config: {
		ignore_past_due: false,
	},
	billing_controls: {},
	metadata: {},
};

/** Core plan — no license/variant graph. Nested `license.plan` / `variant.plan` use this. */
export const ApiPlanV1Schema = z.object({
	// Identity
	id: z.string().meta({
		description: "Unique identifier for the plan.",
	}),
	name: z.string().meta({
		description: "Display name of the plan.",
	}),
	description: z.string().nullable().meta({
		description: "Optional description of the plan.",
	}),
	group: z.string().nullable().meta({
		description:
			"Group identifier for organizing related plans. Plans in the same group are mutually exclusive.",
	}),

	// Flags
	version: z.number().meta({
		description:
			"Version number of the plan. Incremented when plan configuration changes.",
	}),
	version_slug: z.string().nullable().optional().meta({
		description:
			"User-facing version identity. Defaults to v{n} when the version is minted.",
	}),
	active: z.boolean().optional().meta({
		description:
			"Whether this is the active version of the plan. At most one version is active.",
	}),
	add_on: z.boolean().meta({
		description:
			"Whether this is an add-on plan that can be attached alongside a main plan.",
	}),
	auto_enable: z.boolean().meta({
		description:
			"If true, this plan is automatically attached when a customer is created. Used for free plans.",
	}),

	// Pricing
	price: z
		.object({
			amount: z.number().meta({
				description:
					"Base price amount for the plan, in major currency units (e.g. dollars).",
			}),
			additional_currencies: AdditionalCurrencyPriceArraySchema.optional().meta(
				{
					description:
						"Base price amounts in additional currencies. The base 'amount' is in the org's default currency.",
				},
			),
			interval: z.enum(BillingInterval).meta({
				description: "Billing interval (e.g. 'month', 'year').",
			}),
			interval_count: z.number().optional().meta({
				description: "Number of intervals per billing cycle. Defaults to 1.",
			}),
			entitlement_id: z.string().optional().meta({
				internal: true,
			}),
			price_id: z.string().optional().meta({
				internal: true,
			}),
			display: DisplaySchema.optional().meta({
				description: "Display text for showing this price in pricing pages.",
			}),
			processors: ApiPriceProcessorsSchema.optional().meta({
				description:
					"Payment processors this base price is connected to. Omitted when unset.",
			}),
		})
		.nullable()
		.meta({
			description:
				"Base recurring price for the plan. Null for free plans or usage-only plans.",
		}),
	items: z.array(ApiPlanItemV1Schema).meta({
		description:
			"Feature configurations included in this plan. Each item defines included units, pricing, and reset behavior for a feature.",
	}),
	processors: ApiPlanProcessorsSchema.optional().meta({
		description:
			"Payment processors this plan is connected to. Omitted when unset.",
	}),
	free_trial: ApiFreeTrialV2Schema.optional().meta({
		description:
			"Free trial configuration. If set, new customers can try this plan before being charged.",
	}),

	// Meta
	created_at: z.number().meta({
		description: "Unix timestamp (ms) when the plan was created.",
	}),
	env: z.enum(AppEnv).meta({
		description: "Environment this plan belongs to ('sandbox' or 'live').",
	}),
	archived: z.boolean().meta({
		description:
			"Whether the plan is archived. Archived plans cannot be attached to new customers.",
	}),
	config: ProductConfigSchema.meta({
		description: "Miscellaneous plan-level configuration flags.",
	}),
	billing_controls: CustomerBillingControlsSchema.optional().meta({
		description: "Plan-level billing controls used as customer defaults.",
	}),
	metadata: ProductMetadataSchema.meta({
		description:
			"Arbitrary key-value metadata defined by you for your own use. Shared across all versions of the plan.",
	}),
	customer_eligibility: CustomerEligibilitySchema.optional(),

	// Variant identity — this plan as a variant of a base
	base_variant_id: z.string().nullable().meta({
		description:
			"Deprecated. Use variant_details.base_plan_id instead. If this is a variant, the ID of the base plan it was created from.",
		deprecated: true,
	}),
	variant_details: z
		.object({
			base_plan_id: z.string().meta({
				description: "The ID of the base plan this variant was derived from.",
			}),
			customize: VariantCustomizeSchema.optional().meta({
				description:
					"The customization that transforms the base plan into this variant.",
			}),
		})
		.optional()
		.meta({
			description:
				"Details about how this variant relates to its latest base plan.",
		}),
});

export type ApiPlanV1 = z.infer<typeof ApiPlanV1Schema>;

export const ApiPlanV1WithMeta = ApiPlanV1Schema.meta({
	id: "Plan",
	description:
		"A plan defines a set of features, pricing, and entitlements that can be attached to customers.",
	example: API_PLAN_V1_EXAMPLE,
});

/** ApiPlanV1 plus its license and variant edges. */
export const ApiPlanExpandedV1Schema = ApiPlanV1Schema.extend({
	licenses: z.array(ApiPlanLicenseV1Schema).optional().meta({
		internal: true,
		description:
			"Plans offered as assignable licenses under this plan. Omitted when the plan has none.",
	}),
	variants: z.array(ApiPlanVariantV1Schema).optional().meta({
		description:
			"Variant plans derived from this base plan. Omitted when the plan has none.",
	}),
});

export type ApiPlanExpandedV1 = z.infer<typeof ApiPlanExpandedV1Schema>;
