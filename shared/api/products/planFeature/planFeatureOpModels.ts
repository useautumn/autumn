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
		feature_id: z.string(),
		granted: z.number().optional(),
		unlimited: z.boolean().optional(),

		reset_interval: z.enum(ResetInterval).optional(),
		reset_interval_count: z.number().optional(),
		reset_usage_on_enabled: z.boolean().optional(),

		price: z
			.object({
				amount: z.number().optional(),
				tiers: z.array(UsageTierSchema).optional(),

				interval: z.enum(BillingInterval),
				interval_count: z.number().default(1).optional(),

				billing_units: z.number().default(1).optional(),
				usage_model: z.enum(UsageModel),
				max_purchase: z.number().optional(),
			})
			.optional(),

		proration: z
			.object({
				on_increase: z.enum(OnIncrease),
				on_decrease: z.enum(OnDecrease),
			})
			.optional(),

		rollover: z
			.object({
				max: z.number(),
				expiry_duration_type: z.enum(ResetInterval),
				expiry_duration_length: z.number().optional(),
			})
			.optional(),
	})
	.check((ctx) => {
		const resetGroup =
			ctx.value.reset_interval || ctx.value.reset_interval_count !== undefined;
		const intervalGroup =
			ctx.value.price?.interval ||
			ctx.value.price?.interval_count !== undefined;

		if (resetGroup && intervalGroup) {
			ctx.issues.push({
				code: "custom",
				message:
					"reset_interval/reset_interval_count and interval/interval_count are mutually exclusive.",
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
