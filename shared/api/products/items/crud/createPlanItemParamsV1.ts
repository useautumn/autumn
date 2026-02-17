import { BillingMethod } from "@api/products/components/billingMethod.js";
import { RolloverExpiryDurationType } from "@models/productModels/durationTypes/rolloverExpiryDurationType.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { ResetInterval } from "@models/productModels/intervals/resetInterval.js";
import { UsageTierSchema } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums.js";
import { z } from "zod/v4";

export const CreatePlanItemParamsV1Schema = z
	.object({
		feature_id: z.string(),
		included: z.number().optional(),
		unlimited: z.boolean().optional(),

		reset: z
			.object({
				interval: z.enum(ResetInterval),
				interval_count: z.number().optional(),
			})
			.optional(),

		price: z
			.object({
				amount: z.number().optional(),
				tiers: z.array(UsageTierSchema).optional(),

				interval: z.enum(BillingInterval),
				interval_count: z.number().default(1).optional(),

				billing_units: z.number().default(1).optional(),
				billing_method: z.enum(BillingMethod),
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
				max: z.number().optional(),
				expiry_duration_type: z.enum(RolloverExpiryDurationType),
				expiry_duration_length: z.number().optional(),
			})
			.optional(),

		// Internal
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
	});
export type CreatePlanItemParamsV1 = z.infer<
	typeof CreatePlanItemParamsV1Schema
>;
