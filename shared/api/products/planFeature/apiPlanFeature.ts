import { UsageTierSchema } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { BillingInterval } from "@models/productModels/priceModels/priceEnums.js";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums.js";
import { UsageModel } from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";
import { ResetInterval } from "../planEnums.js";

export const ApiPlanFeatureSchema = z
	.object({
		feature_id: z.string(),
		granted_balance: z.number(),
		unlimited: z.boolean(),

		reset: z
			.object({
				interval: z.enum(ResetInterval).optional(),
				interval_count: z.number().optional(),
				reset_when_enabled: z.boolean().optional(),
			})
			.optional(),

		price: z
			.object({
				amount: z.number().optional(),
				tiers: z.array(UsageTierSchema).optional(),

				interval: z.enum(BillingInterval),
				interval_count: z.number().optional(),

				billing_units: z.number(),
				usage_model: z.enum(UsageModel),

				// Use max_purchase for pay per use features
				max_purchase: z.number().optional(),
			})
			.optional(),

		display: z
			.object({
				primary_text: z.string(),
				secondary_text: z.string().optional(),
			})
			.optional(),

		rollover: z
			.object({
				max: z.number().nullable(),
				expiry_duration_type: z.enum(ResetInterval),
				expiry_duration_length: z.number().optional(),
			})
			.optional(),

		proration: z
			.object({
				on_increase: z.enum(OnIncrease).optional(),
				on_decrease: z.enum(OnDecrease).optional(),
			})
			.optional(),
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
					"Top level reset intervals and feature price intervals are mutually exclusive.",
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

export type ApiPlanFeature = z.infer<typeof ApiPlanFeatureSchema>;
