import { z } from "zod/v4";
import { ApiInvoiceV1Schema } from "./apiInvoiceV1.js";

export const ApiListInvoiceV1Schema = ApiInvoiceV1Schema.extend({
	id: z.string().meta({
		description: "The Autumn invoice ID",
		example: "inv_2b3c4d5e6f7g8h",
	}),
	customer_id: z.string().nullable().meta({
		description:
			"The ID of the customer this invoice belongs to. Null for customers created without an ID.",
		example: "cus_123",
	}),
	entity_id: z.string().nullable().meta({
		description:
			"The ID of the entity this invoice belongs to, if entity-scoped",
		example: "ent_456",
	}),
	amount_paid: z.number().nullable().meta({
		description:
			"The amount paid on the invoice. Null on invoices recorded before amounts paid were tracked.",
		example: 29.99,
	}),
	refunded_amount: z.number().meta({
		description: "The total amount refunded on the invoice",
		example: 0,
	}),
});

export type ApiListInvoiceV1 = z.infer<typeof ApiListInvoiceV1Schema>;
