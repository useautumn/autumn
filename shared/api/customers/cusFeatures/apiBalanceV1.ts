import {
	ApiBalanceResetSchema,
	ApiBalanceRolloverSchema,
} from "@api/customers/cusFeatures/apiBalance.js";
import { UsageTierSchema } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../../features/apiFeatureV1.js";

export enum BillingMethod {
	Prepaid = "prepaid",
	UsageBased = "usage_based",
}

export const ApiBalanceBreakdownV1Schema = z.object({
	id: z.string().default(""),
	plan_id: z.string().nullable(),

	included_grant: z.number(),
	prepaid_grant: z.number(),
	remaining: z.number(),
	usage: z.number(),
	unlimited: z.boolean(),

	reset: ApiBalanceResetSchema.nullable(),

	price: z
		.object({
			amount: z.number().optional(),
			tiers: z.array(UsageTierSchema).optional(),
			billing_units: z.number(),
			billing_method: z.enum(BillingMethod),
			max_purchase: z.number().nullable(),
		})
		.nullable(),

	// Extra fields
	prepaid_quantity: z.number().default(0),
	expires_at: z.number().nullable(), // For loose entitlements with expiry
});

export const ApiBalanceV1Schema = z.object({
	feature_id: z.string(),
	feature: ApiFeatureV1Schema.optional(),
	unlimited: z.boolean(),

	granted: z.number(),
	remaining: z.number(),
	usage: z.number(),

	overage_allowed: z.boolean(),
	max_purchase: z.number().nullable(),
	reset: ApiBalanceResetSchema.nullable(),

	breakdown: z.array(ApiBalanceBreakdownV1Schema).optional(),
	rollovers: z.array(ApiBalanceRolloverSchema).optional(),
});

export type ApiBalanceBreakdownV1 = z.infer<typeof ApiBalanceBreakdownV1Schema>;
export type ApiBalanceV1 = z.infer<typeof ApiBalanceV1Schema>;
