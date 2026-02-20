import { AttachScenario } from "@models/checkModels/checkPreviewModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { z } from "zod/v4";
import { ApiFreeTrialV2Schema } from "./components/apiFreeTrialV2.js";
import { DisplaySchema } from "./components/display.js";
import {
	API_PLAN_ITEM_PREPAID_EXAMPLE,
	API_PLAN_ITEM_USAGE_BASED_EXAMPLE,
	ApiPlanItemV1Schema,
} from "./items/apiPlanItemV1.js";

export const API_PLAN_V1_EXAMPLE = {
	id: "pro",
	name: "Pro Plan",
	description: null,
	group: null,
	version: 1,
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
};

export const ApiPlanV1Schema = z.object({
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

	version: z.number().meta({
		description:
			"Version number of the plan. Incremented when plan configuration changes.",
	}),
	add_on: z.boolean().meta({
		description:
			"Whether this is an add-on plan that can be attached alongside a main plan.",
	}),
	auto_enable: z.boolean().meta({
		description:
			"If true, this plan is automatically attached when a customer is created. Used for free plans.",
	}),

	price: z
		.object({
			amount: z.number().meta({
				description: "Base price amount for the plan.",
			}),
			interval: z.enum(BillingInterval).meta({
				description: "Billing interval (e.g. 'month', 'year').",
			}),
			interval_count: z.number().optional().meta({
				description: "Number of intervals per billing cycle. Defaults to 1.",
			}),
			display: DisplaySchema.optional().meta({
				description: "Display text for showing this price in pricing pages.",
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
	free_trial: ApiFreeTrialV2Schema.optional().meta({
		description:
			"Free trial configuration. If set, new customers can try this plan before being charged.",
	}),

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
	base_variant_id: z.string().nullable().meta({
		description:
			"If this is a variant, the ID of the base plan it was created from.",
	}),

	customer_eligibility: z
		.object({
			trial_available: z.boolean().optional().meta({
				description: "Whether a free trial is available for this customer.",
			}),
			scenario: z.enum(AttachScenario).meta({
				description:
					"The attach scenario for this customer (e.g. new_subscription, upgrade, downgrade).",
			}),
		})
		.optional()
		.meta({
			internal: true,
		}),
});

export type ApiPlanV1 = z.infer<typeof ApiPlanV1Schema>;

export const ApiPlanV1WithMeta = ApiPlanV1Schema.meta({
	id: "Plan",
	description:
		"A plan defines a set of features, pricing, and entitlements that can be attached to customers.",
	example: API_PLAN_V1_EXAMPLE,
});
