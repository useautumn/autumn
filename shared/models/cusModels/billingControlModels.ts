import { z } from "zod/v4";
import { BillingInterval } from "../productModels/intervals/billingInterval.js";

export const AutoTopupPurchaseLimitSchema = z.object({
	interval: z.enum(BillingInterval),
	limit: z.number().min(1),
});

export const AutoTopupSchema = z.object({
	feature_id: z.string(),
	enabled: z.boolean().default(false),
	threshold: z.number().min(0),
	quantity: z.number().min(1),
	purchase_limit: AutoTopupPurchaseLimitSchema.optional(),
});

export const CustomerBillingControlsSchema = z.object({
	auto_topups: z.array(AutoTopupSchema).optional(),
});

export type AutoTopupPurchaseLimit = z.infer<
	typeof AutoTopupPurchaseLimitSchema
>;
export type AutoTopup = z.infer<typeof AutoTopupSchema>;
export type CustomerBillingControls = z.infer<
	typeof CustomerBillingControlsSchema
>;
