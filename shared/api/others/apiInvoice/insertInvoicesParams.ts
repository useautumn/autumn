import { z } from "zod/v4";
import { InvoiceStatus } from "../../../models/cusModels/invoiceModels/invoiceModels.js";
import { ProcessorType } from "../../../models/genModels/genEnums.js";

export const InsertInvoiceParamsSchema = z.object({
	customer_id: z.string().meta({
		description: "The customer this invoice belongs to.",
	}),
	entity_id: z.string().optional().meta({
		description: "The entity this invoice belongs to.",
		internal: true,
	}),
	plan_ids: z.array(z.string()).default([]).meta({
		description: "Plan IDs represented by this invoice.",
	}),
	stripe_id: z.string().meta({
		description: "The processor's stable invoice ID.",
	}),
	processor_type: z.enum(ProcessorType).default(ProcessorType.Stripe).meta({
		description: "The billing processor that owns this invoice.",
	}),
	status: z.enum(InvoiceStatus).meta({
		description: "The invoice status.",
	}),
	total: z.number().meta({
		description: "The invoice total in major currency units.",
	}),
	amount_paid: z.number().nullable().default(null).meta({
		description: "The amount paid in major currency units.",
	}),
	refunded_amount: z.number().default(0).meta({
		description: "The refunded amount in major currency units.",
	}),
	currency: z.string().optional().meta({
		description:
			"The currency code. Defaults to the organization's default currency.",
	}),
	created_at: z.number().meta({
		description: "The invoice creation timestamp in milliseconds.",
	}),
	hosted_invoice_url: z.string().nullable().default(null).meta({
		description: "The hosted invoice URL, when available.",
	}),
});

export const InsertInvoicesParamsSchema = z.object({
	invoices: z.array(InsertInvoiceParamsSchema).max(500).meta({
		description: "Invoices to insert or update, in response order.",
	}),
});

export type InsertInvoiceParams = z.infer<typeof InsertInvoiceParamsSchema>;
export type InsertInvoicesParams = z.infer<typeof InsertInvoicesParamsSchema>;
