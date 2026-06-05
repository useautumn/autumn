import { z } from "zod/v4";

export const InvoiceTemplateSchema = z.object({
	id: z.string().meta({
		description: "Unique identifier for the invoice template.",
	}),
	name: z.string().meta({
		description:
			"User-defined name to distinguish this template when sending an invoice.",
	}),
	footer: z.string().optional().meta({
		description:
			"Footer text rendered on the invoice, typically bank details so customers can pay directly.",
	}),
	memo: z.string().optional().meta({
		description:
			"Memo shown near the top of the invoice (Stripe invoice description), e.g. a contact line for payment questions.",
	}),
	net_terms_days: z.number().int().positive().optional().meta({
		description:
			"Default number of days the customer has to pay before the invoice is due. Overridable when sending.",
	}),
	created_at: z.number().optional().meta({
		description: "Timestamp (ms) when the template was created.",
	}),
});

export type InvoiceTemplate = z.infer<typeof InvoiceTemplateSchema>;
