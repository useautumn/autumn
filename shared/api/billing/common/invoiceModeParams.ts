import { z } from "zod/v4";
export const InvoiceModeParamsSchema = z
	.object({
		enabled: z.boolean().meta({
			description:
				"When true, creates an invoice and sends it to the customer instead of charging their card immediately. Uses Stripe's send_invoice collection method.",
		}),
		enable_plan_immediately: z.boolean().default(false).meta({
			description:
				"If true, enables the plan immediately even though the invoice is not paid yet.",
		}),
		finalize: z.boolean().default(true).meta({
			description:
				"If true, finalizes the invoice so it can be sent to the customer. If false, keeps it as a draft for manual review.",
		}),
		invoice_template_id: z.string().optional().meta({
			description:
				"ID of an invoice template (configured in billing settings) whose footer (e.g. bank details) is applied to the invoice.",
		}),
		net_terms_days: z.number().int().positive().optional().meta({
			description:
				"Number of days the customer has to pay the invoice before it is due (Stripe days_until_due).",
		}),
	})
	.meta({
		title: "InvoiceMode",
		description:
			"Invoice mode configuration. Creates an invoice instead of charging the card immediately.",
	});

export type InvoiceModeParams = z.infer<typeof InvoiceModeParamsSchema>;
