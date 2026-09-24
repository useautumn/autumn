import { z } from "zod/v4";

export const ApiInvoiceItemEntitySchema = z.object({
	entity_id: z.string().meta({
		description: "The entity this share of the line item is attributed to",
		example: "acme-docs-prod",
	}),
	quantity: z.number().nullable().meta({
		description: "Quantity charged to this entity. Null on fixed-price lines.",
		example: 842000,
	}),
	amount: z.number().meta({
		description: "Amount attributed to this entity, pre-discount and pre-tax",
		example: 1684,
	}),
});

export const ApiInvoiceItemSchema = z.object({
	id: z.string().meta({
		description:
			"The Autumn invoice line item ID. Stable across reads, and can be used to reference this line in later calls.",
		example: "invoice_li_2b3c4d5e6f7g8h",
	}),
	description: z.string().meta({
		description: "Description of the invoice line item",
		example: "Pro Plan - Monthly Subscription",
	}),
	period_start: z.number().nullable().meta({
		description: "Timestamp when the billing period starts",
		example: 1759247877000,
	}),
	period_end: z.number().nullable().meta({
		description: "Timestamp when the billing period ends",
		example: 1761839877000,
	}),
	plan_id: z.string().nullable().meta({
		description:
			"The plan this line item came from. Null for lines with no Autumn plan behind them.",
		example: "pro",
	}),
	feature_id: z.string().nullable().meta({
		description: "The ID of the feature associated with this line item",
		example: "feature_123",
	}),
	feature_name: z.string().nullable().meta({
		description: "The name of the feature associated with this line item",
		example: "API Calls",
	}),
	quantity: z.number().nullable().meta({
		description:
			"Quantity actually charged on this line. Null on fixed-price lines.",
		example: 842000,
	}),
	amount: z.number().meta({
		description:
			"Amount charged on this line, pre-discount and pre-tax. Negative for credits.",
		example: 1684,
	}),
	entities: z.array(ApiInvoiceItemEntitySchema).meta({
		description:
			"How this line splits by entity. Empty for customer-level lines. Only populated for invoices finalized after entity attribution shipped.",
	}),
});

export type ApiInvoiceItem = z.infer<typeof ApiInvoiceItemSchema>;
export type ApiInvoiceItemEntity = z.infer<typeof ApiInvoiceItemEntitySchema>;
