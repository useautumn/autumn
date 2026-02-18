import { ApiFeatureV0Schema } from "@api/features/prevVersions/apiFeatureV0.js";
import { DisplaySchema } from "@api/products/components/display.js";
import { RolloverExpiryDurationType } from "@models/productModels/durationTypes/rolloverExpiryDurationType.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { ResetInterval } from "@models/productModels/intervals/resetInterval.js";
import { UsageTierSchema } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums.js";
import { UsageModel } from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";

export const ApiPlanItemV0Schema = z
	.object({
		feature_id: z.string(),
		feature: ApiFeatureV0Schema.optional(),

		granted_balance: z.number(),
		unlimited: z.boolean(),

		reset: z
			.object({
				interval: z.enum(ResetInterval),
				interval_count: z.number().optional(),
				reset_when_enabled: z.boolean(),
			})
			.nullable(),

		price: z
			.object({
				amount: z.number().optional(),
				tiers: z.array(UsageTierSchema).optional(),

				interval: z.enum(BillingInterval),
				interval_count: z.number().optional(),

				billing_units: z.number(),
				usage_model: z.enum(UsageModel),
				max_purchase: z.number().nullable(),
			})
			.nullable(),

		display: DisplaySchema.optional(),

		rollover: z
			.object({
				max: z.number().nullable(),
				expiry_duration_type: z.enum(RolloverExpiryDurationType),
				expiry_duration_length: z.number().optional(),
			})
			.optional(),

		proration: z
			.object({
				on_increase: z.enum(OnIncrease).optional(),
				on_decrease: z.enum(OnDecrease).optional(),
			})
			.optional(),

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

		if (ctx.value.price) {
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

export type ApiPlanItemV0 = z.infer<typeof ApiPlanItemV0Schema>;

export const ApiPlanItemV0WithMeta = ApiPlanItemV0Schema.meta({
	id: "PlanFeature",
	description: "Plan feature object returned by the API",
	example: {
		feature_id: "123",
		granted_balance: 100,
		unlimited: false,
		price: null,
	},
});
