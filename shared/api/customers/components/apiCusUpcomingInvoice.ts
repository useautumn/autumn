import { ApiDiscountSchema } from "@api/others/apiDiscount.js";
import { z } from "zod/v4";

export const ApiCusUpcomingInvoiceSchema = z.object({
	lines: z.array(
		z.object({
			product_id: z.string().nullish(),
			description: z.string(),
			amount: z.number(),
		}),
	),
	discounts: z.array(ApiDiscountSchema),
	subtotal: z.number(),
	total: z.number(),
	currency: z.string(),
});

export type ApiCusUpcomingInvoice = z.infer<typeof ApiCusUpcomingInvoiceSchema>;
