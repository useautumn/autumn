import { z } from "zod";

const InvoiceItemSchema = z.object({
	id: z.string(),
	created_at: z.number(),
	updated_at: z.number(),

	// customer_id: z.string(), // just to show
	customer_id: z.string(),
	customer_price_id: z.string(),
	period_start: z.number(),
	period_end: z.number(),
	proration_start: z.number(),
	proration_end: z.number(),

	quantity: z.number(), // of feature
	amount: z.number(),
	currency: z.string(),
	added_to_stripe: z.boolean(),
});

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
