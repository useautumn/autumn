import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { z } from "zod/v4";
import { DisplaySchema } from "../display";

export const BasePriceSchema = z.object({
	amount: z.number(),
	interval: z.enum(BillingInterval),
	interval_count: z.number().optional(),
	display: DisplaySchema.optional(),
});

export const BasePriceParamsSchema = BasePriceSchema.omit({
	display: true,
}).extend({
	interval_count: z.number().optional(),

	entitlement_id: z.string().optional().meta({
		internal: true,
	}),
	price_id: z.string().optional().meta({
		internal: true,
	}),
});

export type BasePrice = z.infer<typeof BasePriceSchema>;
export type BasePriceParams = z.infer<typeof BasePriceParamsSchema>;
