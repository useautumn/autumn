import { UsageTierSchema } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { UsageModel } from "@models/productV2Models/productItemModels/productItemModels";
import z from "zod/v4";
import { ApiBalanceResetV0Schema } from "../apiBalanceReset/apiBalanceResetV0";

export const ApiBalanceBreakdownPriceSchema = z.object({
	amount: z.number().optional(),
	tiers: z.array(UsageTierSchema).optional(),
	billing_units: z.number(),
	usage_model: z.enum(UsageModel),
	max_purchase: z.number().nullable(),
});

export const ApiBalanceBreakdownV1Schema = z.object({
	id: z.string().default(""),
	plan_id: z.string().nullable(),

	included_grant: z.number(),
	prepaid_grant: z.number(),
	remaining: z.number(),
	usage: z.number(),

	reset: ApiBalanceResetV0Schema.nullable(),

	// Extra fields
	prepaid_quantity: z.number().default(0),
	expires_at: z.number().nullable(),
	price: ApiBalanceBreakdownPriceSchema.nullable(),
});
export type ApiBalanceBreakdownV1 = z.infer<typeof ApiBalanceBreakdownV1Schema>;
