import { z } from "zod/v4";

export const CreditNoteDestinationSchema = z
	.enum(["customer_balance", "refund", "out_of_band"])
	.meta({
		description:
			"Where already-paid money goes. customer_balance credits the customer's balance for their next invoice, refund returns it to the original payment method, and out_of_band records money returned outside Stripe.",
	});

export const CreditNoteReasonSchema = z.enum([
	"duplicate",
	"fraudulent",
	"order_change",
	"product_unsatisfactory",
]);

export const IssueCreditNoteLineSchema = z
	.object({
		id: z.string().meta({
			description:
				"The invoice line item ID (invoice_li_...) from the invoice's items.",
			example: "invoice_li_2b3c4d5e6f7g8h",
		}),
		amount: z.number().positive().optional().meta({
			description:
				"Amount to credit on this line, pre-discount and pre-tax like the line's own amount. The line's discount share and tax are applied on top.",
			example: 20,
		}),
		quantity: z.number().positive().optional().meta({
			description: "Number of units of this line to credit.",
			example: 1,
		}),
	})
	.strict();

export const IssueCreditNoteParamsSchema = z
	.object({
		invoice_id: z.string().meta({
			description: "The Autumn invoice ID to credit. Must be open or paid.",
			example: "inv_2b3c4d5e6f7g8h",
		}),
		amount: z.number().positive().optional().meta({
			description:
				"Total to credit across the whole invoice. Cannot be combined with lines.",
			example: 20,
		}),
		lines: z.array(IssueCreditNoteLineSchema).min(1).optional().meta({
			description:
				"Credit specific invoice lines instead of a flat amount. Cannot be combined with amount. Unavailable on invoices recorded before line item storage.",
		}),
		destination: CreditNoteDestinationSchema.default("customer_balance"),
		send_email: z.boolean().default(true).meta({
			description: "Email the credit note to the customer.",
		}),
		reason: CreditNoteReasonSchema.optional().meta({
			description: "Reason shown on the credit note.",
		}),
		memo: z.string().optional().meta({
			description: "Memo printed on the credit note PDF.",
		}),
		preview: z.boolean().optional().meta({
			description:
				"Return the credit note that would be issued without creating it.",
		}),
	})
	.strict();

export const ApiCreditNoteLineSchema = z.object({
	invoice_line_item_id: z.string().nullable().meta({
		description:
			"The credited invoice line item ID, if the credit targeted a line.",
		example: "invoice_li_2b3c4d5e6f7g8h",
	}),
	description: z.string().nullable(),
	quantity: z.number().nullable(),
	amount: z.number().meta({
		description: "Amount credited on this line, pre-discount and pre-tax.",
		example: 20,
	}),
	discount_amount: z.number(),
});

export const ApiCreditNoteSchema = z.object({
	id: z.string().nullable().meta({
		description: "The Stripe credit note ID. Null on previews.",
		example: "cn_1MxvRqLkdIwHu7ixY0xbUcxk",
	}),
	invoice_id: z.string().meta({
		description: "The Autumn invoice ID this credit note adjusts.",
		example: "inv_2b3c4d5e6f7g8h",
	}),
	number: z.string().nullable().meta({
		description: "Credit note number shown on the PDF. Null on previews.",
	}),
	status: z.string().nullable().meta({
		description: "issued or void. Null on previews.",
	}),
	currency: z.string(),
	subtotal: z.number(),
	discount_amount: z.number(),
	tax_amount: z.number(),
	total: z.number().meta({
		description: "Total credited, including discounts and tax.",
		example: 17.6,
	}),
	pre_payment_amount: z.number().meta({
		description: "Portion that reduced the amount still owed on the invoice.",
	}),
	post_payment_amount: z.number().meta({
		description: "Portion of already-paid money returned to the customer.",
	}),
	refund_amount: z.number(),
	credit_amount: z.number(),
	out_of_band_amount: z.number(),
	reason: CreditNoteReasonSchema.nullable(),
	memo: z.string().nullable(),
	pdf: z.string().nullable().meta({
		description: "URL of the credit note PDF. Null on previews.",
	}),
	lines: z.array(ApiCreditNoteLineSchema),
});

export const IssueCreditNoteResponseSchema = z.object({
	credit_note: ApiCreditNoteSchema,
});

export type CreditNoteDestination = z.infer<typeof CreditNoteDestinationSchema>;
export type IssueCreditNoteParams = z.infer<typeof IssueCreditNoteParamsSchema>;
export type ApiCreditNote = z.infer<typeof ApiCreditNoteSchema>;
export type IssueCreditNoteResponse = z.infer<
	typeof IssueCreditNoteResponseSchema
>;
