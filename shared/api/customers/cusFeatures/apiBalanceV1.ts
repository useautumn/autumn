import { BillingMethod } from "@api/products/components/billingMethod";
import { UsageTierSchema } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../../features/apiFeatureV1";
import { ApiBalanceResetSchema, ApiBalanceRolloverSchema } from "./apiBalance";

export const ApiBalanceBreakdownPriceSchema = z.object({
	amount: z.number().optional(),
	tiers: z.array(UsageTierSchema).optional(),
	billing_units: z.number(),
	billing_method: z.enum(BillingMethod),
	max_purchase: z.number().nullable(),
});

export const ApiBalanceBreakdownV1Schema = z.object({
	object: z.literal("balance_breakdown").meta({
		internal: true,
	}),

	id: z.string().default(""),
	plan_id: z.string().nullable(),

	included_grant: z.number(),
	prepaid_grant: z.number(),
	remaining: z.number(),
	usage: z.number(),
	unlimited: z.boolean(),

	reset: ApiBalanceResetSchema.nullable(),

	price: ApiBalanceBreakdownPriceSchema.nullable(),

	// Extra fields
	expires_at: z.number().nullable(), // For loose entitlements with expiry

	overage: z.number().meta({
		internal: true,
	}),
});

export const ApiBalanceV1Schema = z.object({
	object: z.literal("balance").meta({
		internal: true,
	}),

	feature_id: z.string(),
	feature: ApiFeatureV1Schema.optional(),

	// Included + prepaid balance
	granted: z.number(),

	// Remaining balance, cannot go below 0
	remaining: z.number().min(0),

	//
	usage: z.number(),
	unlimited: z.boolean(),

	overage_allowed: z.boolean(),
	max_purchase: z.number().nullable(),
	next_reset_at: z.number().nullable(),

	breakdown: z.array(ApiBalanceBreakdownV1Schema).optional(),
	rollovers: z.array(ApiBalanceRolloverSchema).optional(),
});

export type ApiBalanceBreakdownPrice = z.infer<
	typeof ApiBalanceBreakdownPriceSchema
>;
export type ApiBalanceBreakdownV1 = z.infer<typeof ApiBalanceBreakdownV1Schema>;
export type ApiBalanceV1 = z.infer<typeof ApiBalanceV1Schema>;
