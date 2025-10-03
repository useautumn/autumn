import { APIDiscountSchema } from "@api/others/apiDiscount.js";
import { z } from "zod/v4";

export const APICusUpcomingInvoiceSchema = z.object({
	lines: z.array(
		z.object({
			product_id: z.string().nullish(),
			description: z.string(),
			amount: z.number(),
		}),
	),
	discounts: z.array(APIDiscountSchema),
	subtotal: z.number(),
	total: z.number(),
	currency: z.string(),
});

export type APICusUpcomingInvoice = z.infer<typeof APICusUpcomingInvoiceSchema>;
