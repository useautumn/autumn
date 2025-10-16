import { ApiCusRolloverSchema } from "@api/models.js";
import { AttachScenario } from "@models/checkModels/checkPreviewModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums.js";
import { UsageTierSchema } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { BillingInterval } from "@models/productModels/priceModels/priceEnums.js";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums.js";
import { UsageModel } from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";

export enum ResetInterval {
	OneOff = "one_off",
	Minute = "minute",
	Hour = "hour",
	Day = "day",
	Week = "week",
	Month = "month",
	Quarter = "quarter",
	SemiAnnual = "semi_annual",
	Year = "year",
}

export const ApiFreeTrialV2Schema = z.object({
	duration_type: z.enum(FreeTrialDuration),
	duration_length: z.number(),
	card_required: z.boolean(),
});

export const ApiPlanFeatureSchema = z.object({
	feature_id: z.string(),
	granted: z.number(),
	unlimited: z.boolean(),

	reset_interval: z.enum(ResetInterval),
	reset_interval_count: z.number().optional(),
	reset_usage_on_attach: z.boolean(),

	price: z.object({
		amount: z.number().optional(),
		tiers: z.array(UsageTierSchema).optional(),

		interval: z.enum(BillingInterval),
		interval_count: z.number().optional(),

		billing_units: z.number(),
		usage_model: z.enum(UsageModel),

		// Use paid_limit for pay per use features
		paid_limit: z.number(),

		// Use prepaid_limit for prepaid features
		prepaid_limit: z.number(),
	}),

	proration: z.object({
		on_increase: z.enum(OnIncrease),
		on_decrease: z.enum(OnDecrease),
	}),

	rollover: z.object({
		max: z.number(),
		expiry_duration_type: z.enum(ResetInterval),
		expiry_duration_length: z.number().optional(),
	}),
});

export const ApiPlanSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	group: z.string().nullable(),

	version: z.number(),

	add_on: z.boolean(),
	default: z.boolean(),

	price: z.object({
		amount: z.number(),
		interval: z.enum(BillingInterval),
	}),

	features: z.array(ApiPlanFeatureSchema),
	free_trial: ApiFreeTrialV2Schema.nullable(),

	// Misc
	created_at: z.number(),
	env: z.enum(AppEnv),
	archived: z.boolean(),
	base_variant_id: z.string().nullable().meta({
		description: "ID of the base variant this product is derived from",
		example: "var_1234567890abcdef",
	}),

	customer_context: z.object({
		trial_available: z.boolean(),
		scenario: z.enum(AttachScenario),
	}),
});

// CUSTOMER

export const ApiCusFeatureBreakdownSchema = z.object({
	granted: z.number(),
	balance: z.number(),
	usage: z.number(),
	resets_at: z.number().nullable(),

	reset_interval: z.enum(ResetInterval),
	reset_interval_count: z.number().optional(),
});

export const ApiCusFeatureSchema = z.object({
	feature_id: z.string(),

	unlimited: z.boolean(),
	granted: z.number().nullable(),
	balance: z.number(),
	usage: z.number(),
	resets_at: z.number().nullable(),

	reset_interval: z.enum(ResetInterval),
	reset_interval_count: z.number().optional(),

	breakdown: z.array(ApiCusFeatureBreakdownSchema).nullish(),
	rollovers: z.array(ApiCusRolloverSchema).nullish(),
});

export const ApiCusProductSchema = z.object({
	product_id: z.string(),

	status: z.enum(["active"]),
	cancels_at: z.number().nullable(),
	started_at: z.number(),

	current_period_start: z.number().nullable(),
	current_period_end: z.number().nullable(),

	// Less common
	quantity: z.number(),
	entity_id: z.string().nullable(),
});

export const ApiCustomerSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	created_at: z.number(),
	fingerprint: z.string().nullable(),
	stripe_id: z.string().nullable(),
	env: z.enum(AppEnv),
	metadata: z.record(z.any(), z.any()),

	products: z.array(ApiCusProductSchema),
	features: z.record(z.string(), ApiCusFeatureSchema),
});
