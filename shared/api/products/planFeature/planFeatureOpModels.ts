import { UsageTierSchema } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { BillingInterval } from "@models/productModels/priceModels/priceEnums.js";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums.js";
import { UsageModel } from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";
import { ResetInterval } from "../apiPlan.js";

export const UpdatePlanFeatureSchema = z
	.object({
		feature_id: z.string().meta({
			description: "Reference to the feature being configured",
			example: "seats",
		}),
		granted: z.number().optional().meta({
			description: "Amount of usage granted to customers",
			example: 1000,
		}),
		unlimited: z.boolean().optional().meta({
			description: "Whether usage is unlimited",
			example: false,
		}),

		reset: z
			.object({
				interval: z.enum(ResetInterval).optional().meta({
					description: "How often usage resets",
					example: "month",
				}),
				interval_count: z.number().optional().meta({
					description: "Number of intervals between resets",
					example: 1,
				}),
				when_enabled: z.boolean().optional().meta({
					description: "Whether to reset usage when feature is enabled",
					example: true,
				}),
			})
			.optional()
			.meta({
				description: "Reset configuration for metered features",
				example: { interval: "month" },
			}),

		price: z
			.object({
				amount: z.number().optional().meta({
					description: "Flat price per unit in cents",
					example: 1000,
				}),
				tiers: z.array(UsageTierSchema).optional().meta({
					description: "Tiered pricing structure based on usage ranges",
					example: [{ to: 10, amount: 1000 }, { to: "inf", amount: 800 }],
				}),

				interval: z.enum(BillingInterval).meta({
					description: "Billing frequency (cannot be used with reset.interval)",
					example: "month",
				}),
				interval_count: z.number().default(1).optional().meta({
					description: "Number of intervals between billing",
					example: 1,
				}),

				billing_units: z.number().default(1).optional().meta({
					description: "Number of units per billing cycle",
					example: 1,
				}),
				usage_model: z.enum(UsageModel).meta({
					description: "Billing model: 'prepaid' or 'pay_per_use'",
					example: "pay_per_use",
				}),
				max_purchase: z.number().optional().meta({
					description: "Maximum purchasable quantity",
					example: 100,
				}),
			})
			.optional()
			.meta({
				description: "Pricing configuration for usage-based billing",
				example: { interval: "month", usage_model: "pay_per_use" },
			}),

		proration: z
			.object({
				on_increase: z.enum(OnIncrease).meta({
					description: "Behavior when quantity increases",
					example: "prorate",
				}),
				on_decrease: z.enum(OnDecrease).meta({
					description: "Behavior when quantity decreases",
					example: "no_action",
				}),
			})
			.optional()
			.meta({
				description: "Proration rules for quantity changes",
				example: { on_increase: "prorate", on_decrease: "no_action" },
			}),

		rollover: z
			.object({
				max: z.number().meta({
					description: "Maximum amount that can roll over",
					example: 1000,
				}),
				expiry_duration_type: z.enum(ResetInterval).meta({
					description: "How long rollover lasts before expiring",
					example: "month",
				}),
				expiry_duration_length: z.number().optional().meta({
					description: "Duration length for rollover expiry",
					example: 1,
				}),
			})
			.optional()
			.meta({
				description: "Rollover policy for unused usage",
				example: { max: 1000, expiry_duration_type: "month" },
			}),
	})
	.check((ctx) => {
		const resetGroup =
			ctx.value.reset?.interval ||
			ctx.value.reset?.interval_count !== undefined;
		const intervalGroup =
			ctx.value.price?.interval ||
			ctx.value.price?.interval_count !== undefined;

		if (resetGroup && intervalGroup) {
			ctx.issues.push({
				code: "custom",
				message:
					"reset.interval/reset.interval_count and price.interval/price.interval_count are mutually exclusive.",
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
	});
