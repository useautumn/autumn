import { ApiFeatureV0Schema } from "@api/features/prevVersions/apiFeatureV0.js";
import { BillingMethod } from "@api/products/components/billingMethod.js";
import { DisplaySchema } from "@api/products/components/display.js";
import { RolloverExpiryDurationType } from "@models/productModels/durationTypes/rolloverExpiryDurationType.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { ResetInterval } from "@models/productModels/intervals/resetInterval.js";
import {
	TierBehavior,
	UsageTierSchema,
} from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums";
import { z } from "zod/v4";

export const API_PLAN_ITEM_USAGE_BASED_EXAMPLE = {
	featureId: "messages",
	included: 100,
	unlimited: false,
	reset: {
		interval: "month",
	},
	price: {
		amount: 0.5,
		interval: "month",
		billingUnits: 100,
		billingMethod: "usage_based",
		maxPurchase: null,
	},
	display: {
		primaryText: "100 messages",
		secondaryText: "then $0.5 per 100 messages",
	},
};

export const API_PLAN_ITEM_PREPAID_EXAMPLE = {
	featureId: "users",
	included: 0,
	unlimited: false,
	reset: null,
	price: {
		amount: 10,
		interval: "month",
		billingUnits: 1,
		billingMethod: "prepaid",
		maxPurchase: null,
	},
	display: {
		primaryText: "$10 per Users",
	},
};

export const ApiPlanItemV1Schema = z
	.object({
		feature_id: z.string().meta({
			description: "The ID of the feature this item configures.",
		}),
		feature: ApiFeatureV0Schema.optional().meta({
			description: "The full feature object if expanded.",
		}),

		included: z.number().meta({
			description:
				"Number of free units included. For consumable features, balance resets to this number each interval.",
		}),
		unlimited: z.boolean().meta({
			description: "Whether the customer has unlimited access to this feature.",
		}),

		reset: z
			.object({
				interval: z.enum(ResetInterval).meta({
					description:
						"The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.",
				}),
				interval_count: z.number().optional().meta({
					description: "Number of intervals between resets. Defaults to 1.",
				}),
			})
			.nullable()
			.meta({
				description:
					"Reset configuration for consumable features. Null for non-consumable features like seats where usage persists across billing cycles.",
			}),

		price: z
			.object({
				amount: z.number().optional().meta({
					description:
						"Price per billing_units after included usage is consumed. Mutually exclusive with tiers.",
				}),
				tiers: z.array(UsageTierSchema).optional().meta({
					description:
						"Tiered pricing configuration. Each tier's 'up_to' does NOT include the included amount. Either 'tiers' or 'amount' is required.",
				}),
				tier_behavior: z.enum(TierBehavior).optional(),

				interval: z.enum(BillingInterval).meta({
					description:
						"Billing interval for this price. For consumable features, should match reset.interval.",
				}),
				interval_count: z.number().optional().meta({
					description: "Number of intervals per billing cycle. Defaults to 1.",
				}),

				billing_units: z.number().meta({
					description:
						"Number of units per price increment. Usage is rounded UP to the nearest billing_units when billed (e.g. billing_units=100 means 101 usage rounds to 200).",
				}),
				billing_method: z.enum(BillingMethod).meta({
					description:
						"'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.",
				}),
				max_purchase: z.number().nullable().meta({
					description:
						"Maximum units a customer can purchase beyond included. E.g. if included=100 and max_purchase=300, customer can use up to 400 total before usage is capped. Null for no limit.",
				}),
			})
			.nullable()
			.meta({
				description:
					"Pricing configuration for usage beyond included units. Null if feature is entirely free.",
			}),

		display: DisplaySchema.optional().meta({
			description: "Display text for showing this item in pricing pages.",
		}),

		rollover: z
			.object({
				max: z.number().nullable().meta({
					description: "Maximum rollover units. Null for unlimited rollover.",
				}),
				expiry_duration_type: z.enum(RolloverExpiryDurationType).meta({
					description: "When rolled over units expire.",
				}),
				expiry_duration_length: z.number().optional().meta({
					description: "Number of periods before expiry.",
				}),
			})
			.optional()
			.meta({
				description:
					"Rollover configuration for unused units. If set, unused included units roll over to the next period.",
			}),

		proration: z
			.object({
				on_increase: z.enum(OnIncrease).optional().meta({
					description:
						"How to handle billing when quantity increases mid-cycle (prepaid features only).",
				}),
				on_decrease: z.enum(OnDecrease).optional().meta({
					description:
						"How to handle credits when quantity decreases mid-cycle (prepaid features only).",
				}),
			})
			.optional()
			.meta({
				internal: true,
			}),

		entity_feature_id: z.string().optional().meta({
			internal: true,
		}),
	})
	.check((ctx) => {
		const resetInterval = ctx.value.reset?.interval;
		const priceInterval = ctx.value.price?.interval;

		if (
			resetInterval &&
			priceInterval &&
			String(resetInterval) !== String(priceInterval)
		) {
			ctx.issues.push({
				code: "custom",
				message: "either pass in reset.interval, or price.interval, not both.",
				input: ctx.value,
			});
		}

		if (
			ctx.value !== undefined &&
			ctx.value.price !== undefined &&
			ctx.value.price !== null
		) {
			if (
				ctx.value.price.amount &&
				ctx.value.price.tiers &&
				ctx.value.price.tiers.length > 0
			) {
				ctx.issues.push({
					code: "custom",
					message: "Price amount and tiers are mutually exclusive.",
					input: ctx.value,
				});
			}
		}
	});

export type ApiPlanItemV1 = z.infer<typeof ApiPlanItemV1Schema>;

export const ApiPlanItemV1WithMeta = ApiPlanItemV1Schema.meta({
	id: "PlanItem",
	description:
		"Configuration for a feature within a plan, defining included units, pricing, and reset behavior.",
	example: API_PLAN_ITEM_USAGE_BASED_EXAMPLE,
});
