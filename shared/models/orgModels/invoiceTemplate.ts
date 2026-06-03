import { z } from "zod/v4";

export const InvoiceTemplateSchema = z.object({
	id: z.string().meta({
		description: "Unique identifier for the invoice template.",
	}),
	name: z.string().meta({
		description:
			"User-defined name to distinguish this template when sending an invoice.",
	}),
	footer: z.string().meta({
		description:
			"Footer text rendered on the invoice, typically bank details so customers can pay directly.",
	}),
	created_at: z.number().optional().meta({
		description: "Timestamp (ms) when the template was created.",
	}),
});

export type InvoiceTemplate = z.infer<typeof InvoiceTemplateSchema>;
