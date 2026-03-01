import { z } from "zod/v4";
import { BillingInterval } from "../productModels/intervals/billingInterval.js";

export const AutoTopupMaxPurchasesSchema = z.object({
	interval: z.enum(BillingInterval),
	limit: z.number().min(1),
});

export const AutoTopupSchema = z.object({
	feature_id: z.string(),
	enabled: z.boolean().default(false),
	threshold: z.number().min(0),
	quantity: z.number().min(1),
	max_purchases: AutoTopupMaxPurchasesSchema.optional(),
});

export const CustomerBillingControlsSchema = z.object({
	auto_topup: z.array(AutoTopupSchema).optional(),
});

export type AutoTopupMaxPurchases = z.infer<typeof AutoTopupMaxPurchasesSchema>;
export type AutoTopup = z.infer<typeof AutoTopupSchema>;
export type CustomerBillingControls = z.infer<
	typeof CustomerBillingControlsSchema
>;
