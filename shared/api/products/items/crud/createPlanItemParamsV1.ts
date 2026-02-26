import { BillingMethod } from "@api/products/components/billingMethod";
import { RolloverExpiryDurationType } from "@models/productModels/durationTypes/rolloverExpiryDurationType";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { ResetInterval } from "@models/productModels/intervals/resetInterval";
import {
	TierBehavior,
	UsageTierSchema,
} from "@models/productModels/priceModels/priceConfig/usagePriceConfig";

import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums";
import { z } from "zod/v4";

export const CreatePlanItemParamsV1Schema = z
	.object({
		feature_id: z.string().meta({
			description: "The ID of the feature to configure.",
		}),
		included: z.number().optional().meta({
			description:
				"Number of free units included. Balance resets to this each interval for consumable features.",
		}),
		unlimited: z.boolean().optional().meta({
			description: "If true, customer has unlimited access to this feature.",
		}),

		reset: z
			.object({
				interval: z.enum(ResetInterval).meta({
					description:
						"Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.",
				}),
				interval_count: z.number().optional().meta({
					description: "Number of intervals between resets. Defaults to 1.",
				}),
			})
			.optional()
			.meta({
				description:
					"Reset configuration for consumable features. Omit for non-consumable features like seats.",
			}),

		price: z
			.object({
				amount: z.number().optional().meta({
					description:
						"Price per billing_units after included usage. Either 'amount' or 'tiers' is required.",
				}),
				tiers: z.array(UsageTierSchema).optional().meta({
					description:
						"Tiered pricing.  Either 'amount' or 'tiers' is required.",
				}),
				tier_behavior: z.enum(TierBehavior).optional(),

				interval: z.enum(BillingInterval).meta({
					description:
						"Billing interval. For consumable features, should match reset.interval.",
				}),
				interval_count: z.number().default(1).optional().meta({
					description: "Number of intervals per billing cycle. Defaults to 1.",
				}),

				billing_units: z.number().default(1).optional().meta({
					description:
						"Units per price increment. Usage is rounded UP when billed (e.g. billing_units=100 means 101 rounds to 200).",
				}),
				billing_method: z.enum(BillingMethod).meta({
					description:
						"'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.",
				}),
				max_purchase: z.number().optional().meta({
					description:
						"Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.",
				}),
			})
			.optional()
			.meta({
				description:
					"Pricing for usage beyond included units. Omit for free features.",
			}),

		proration: z
			.object({
				on_increase: z.enum(OnIncrease).meta({
					description: "Billing behavior when quantity increases mid-cycle.",
				}),
				on_decrease: z.enum(OnDecrease).meta({
					description: "Credit behavior when quantity decreases mid-cycle.",
				}),
			})
			.optional()
			.meta({
				description:
					"Proration settings for prepaid features. Controls mid-cycle quantity change billing.",
			}),

		rollover: z
			.object({
				max: z.number().optional().meta({
					description: "Max rollover units. Omit for unlimited rollover.",
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
					"Rollover config for unused units. If set, unused included units carry over.",
			}),

		entity_feature_id: z.string().optional().meta({
			internal: true,
		}),

		entitlement_id: z.string().optional().meta({
			internal: true,
		}),
		price_id: z.string().optional().meta({
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

		// At a minimum, if price is present, at least amount OR tiers must be defined, and not both
		if (ctx.value.price) {
			const { amount, tiers } = ctx.value.price;

			const hasAmount = typeof amount === "number";
			const hasTiers = Array.isArray(tiers) && tiers.length > 0;

			if (!(hasAmount || hasTiers)) {
				ctx.issues.push({
					code: "custom",
					message:
						"If 'price' is present, either 'amount' or 'tiers' must be defined.",
					input: ctx.value.price,
				});
			} else if (hasAmount && hasTiers) {
				ctx.issues.push({
					code: "custom",
					message: "'amount' and 'tiers' cannot both be defined in 'price'.",
					input: ctx.value.price,
				});
			}
		}

		if (ctx.value.price?.tiers) {
			const hasFlatAmount = ctx.value.price.tiers.some(
				(t) => t.flat_amount && t.flat_amount > 0,
			);

			if (
				hasFlatAmount &&
				ctx.value.price.tier_behavior !== TierBehavior.VolumeBased
			) {
				ctx.issues.push({
					code: "custom",
					message:
						"flat_amount on tiers is only supported for volume-based pricing.",
					input: ctx.value.price,
				});
			}

			if (
				ctx.value.price?.tier_behavior === TierBehavior.VolumeBased &&
				ctx.value.price?.billing_method !== BillingMethod.Prepaid
			) {
				ctx.issues.push({
					code: "custom",
					message:
						"volume-based pricing is only supported for prepaid features.",
					input: ctx.value.price,
				});
			}

			if (ctx.value.price?.tiers.length === 0) {
				ctx.issues.push({
					code: "custom",
					message: "tiers cannot be empty.",
					input: ctx.value.price,
				});
			} else if (
				ctx.value.included &&
				typeof ctx.value.price?.tiers[0].to === "number" &&
				ctx.value.price?.tiers[0].to <= ctx.value.included
			) {
				ctx.issues.push({
					code: "custom",
					message: "tiers[0].to must be greater than included.",
					input: ctx.value.price,
				});
			}
		}
	})
	.meta({
		title: "PlanItem",
		description:
			"Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.",
	});
export type CreatePlanItemParamsV1 = z.infer<
	typeof CreatePlanItemParamsV1Schema
>;
