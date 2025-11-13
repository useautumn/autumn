import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { ResetInterval } from "@models/productModels/intervals/resetInterval.js";
import { UsageTierSchema } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { UsageModel } from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";
import { RolloverExpiryDurationType } from "../../../models/productModels/durationTypes/rolloverExpiryDurationType.js";
import {
	OnDecrease,
	OnIncrease,
} from "../../../models/productV2Models/productItemModels/productItemEnums.js";

export const UpdatePlanFeatureSchema = z
	.object({
		feature_id: z.string(),
		granted_balance: z.number().optional(),
		unlimited: z.boolean().optional(),

		reset: z
			.object({
				interval: z.enum(ResetInterval),
				interval_count: z.number().optional(),
				reset_when_enabled: z.boolean().optional(),
			})
			.optional(),

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
				expiry_duration_type: z.enum(RolloverExpiryDurationType),
				expiry_duration_length: z.number().optional(),
			})
			.optional(),
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
	});

export type UpdatePlanFeatureParams = z.infer<typeof UpdatePlanFeatureSchema>;
