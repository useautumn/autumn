import { InvoiceIssueMethodSchema } from "@api/others/apiInvoice/invoiceIssueMethod.js";
import { InvoicePaymentMethodSchema } from "@models/orgModels/orgConfig.js";
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
		// No zod default: an omitted finalize must not outrank issue_method. Omitting both still sends.
		finalize: z.boolean().optional().meta({
			description:
				"Deprecated: use issue_method. true sends the invoice (issue_method: send), false keeps it as a draft (issue_method: draft). Defaults to true. Ignored when issue_method is set.",
			deprecated: true,
		}),
		issue_method: InvoiceIssueMethodSchema.optional().meta({
			description:
				"How far the invoice created now advances. draft leaves it editable for manual review. finalize opens it without Stripe emailing, reminding or charging (auto_advance off), for invoices collected outside Stripe. send opens it and lets Stripe email it. Defaults to send. Requires enabled: true. Renewal invoices follow the subscription.",
		}),
		invoice_template_id: z.string().optional().meta({
			description:
				"ID of an invoice template (configured in billing settings) whose footer (e.g. bank details) is applied to the invoice.",
		}),
		net_terms_days: z.number().int().positive().optional().meta({
			description:
				"Number of days the customer has to pay the invoice before it is due (Stripe days_until_due).",
		}),
		payment_method_types: z
			.array(InvoicePaymentMethodSchema)
			.min(1)
			.optional()
			.meta({
				description:
					"Payment method types the customer can pay the invoice with, e.g. card and us_bank_account. Overrides the org's allowed payment methods.",
			}),
	})
	.meta({
		title: "InvoiceMode",
		description:
			"Invoice mode configuration. Creates an invoice instead of charging the card immediately.",
	});

export type InvoiceModeParams = z.infer<typeof InvoiceModeParamsSchema>;
