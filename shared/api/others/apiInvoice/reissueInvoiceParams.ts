import { CustomLineItemSchema } from "@api/billing/common/customLineItem.js";
import { z } from "zod/v4";
import { ApiListInvoiceV1Schema } from "./apiListInvoiceV1.js";
import {
	CreateInvoicePreviewSchema,
	InvoicePlanParamsSchema,
} from "./createInvoiceParams.js";

/** Name/value pairs Stripe renders on the invoice, e.g. a PO number. */
export const InvoiceCustomFieldSchema = z
	.object({
		name: z.string().max(30),
		value: z.string().max(30),
	})
	.strict();

/** Changes scoped to the replacement invoice only. */
export const ReissueInvoiceOverridesSchema = z
	.object({
		custom_fields: z.array(InvoiceCustomFieldSchema).max(4).optional().meta({
			description:
				"Fields shown on this invoice only, such as a PO number. Up to four; pass an empty array to clear them.",
		}),
		tax_rate_id: z.string().nullable().optional().meta({
			description:
				"Stripe tax rate applied to every line. Omit to keep the original's tax, or pass null to issue the replacement with no tax.",
		}),
		account_tax_ids: z.array(z.string()).nullable().optional().meta({
			description:
				"Your own Stripe tax registrations (atx_...) shown as the seller's tax numbers. Not the customer's.",
		}),
		footer: z.string().nullable().optional().meta({
			description: "Footer text, overriding the original's and any template's.",
		}),
		memo: z.string().nullable().optional().meta({
			description: "Memo shown near the top of the invoice.",
		}),
	})
	.strict();

/** Changes written to the customer, which the replacement then snapshots. */
export const ReissueCustomerOverridesSchema = z
	.object({
		email: z.email().optional().meta({
			description:
				"Billing email. Same as update_customer_email; passing both with different values is rejected.",
		}),
		name: z.string().optional().meta({
			description: "Customer name shown on this and every later invoice.",
		}),
		address: z
			.object({
				line1: z.string().optional(),
				line2: z.string().optional(),
				city: z.string().optional(),
				state: z.string().optional(),
				postal_code: z.string().optional(),
				country: z.string().optional(),
			})
			.strict()
			.optional()
			.meta({
				description:
					"Billing address. Drives tax when the org uses Stripe Tax, and is snapshotted onto the replacement.",
			}),
		tax_ids: z
			.array(
				z
					.object({
						type: z.string(),
						value: z.string(),
					})
					.strict(),
			)
			.optional()
			.meta({
				description:
					"The customer's own tax registrations, e.g. { type: 'eu_vat', value: 'FR123...' }. Replaces the existing set; pass an empty array to remove them.",
			}),
		invoice_settings_custom_fields: z
			.array(InvoiceCustomFieldSchema)
			.max(4)
			.nullable()
			.optional()
			.meta({
				description:
					"Custom fields shown on this and every future invoice. Use invoice.custom_fields for this invoice alone.",
			}),
	})
	.strict();

/** Line edits against the original's lines. */
export const ReissueLineEditsSchema = z
	.object({
		add: z
			.array(
				z.union([CustomLineItemSchema, InvoicePlanParamsSchema]).meta({
					description:
						"Either a custom charge (description + amount) or a catalog plan priced like invoices.create.",
				}),
			)
			.optional(),
		update: z
			.array(
				z
					.object({
						id: z.string().meta({
							description: "The invoice line item ID from invoices.list items.",
						}),
						amount: z.number().optional(),
						description: z.string().optional(),
					})
					.strict(),
			)
			.optional(),
		remove: z.array(z.string()).optional().meta({
			description: "Invoice line item IDs to leave off the replacement.",
		}),
	})
	.strict();

export const ReissueInvoiceParamsSchema = z.object({
	invoice_id: z.string().meta({
		description: "The Autumn invoice ID to void and replace.",
		example: "inv_2b3c4d5e6f7g8h",
	}),
	invoice_template_id: z.string().optional().meta({
		description:
			"ID of an invoice template (configured in billing settings) whose footer and memo are applied to the replacement invoice.",
	}),
	net_terms_days: z.number().int().positive().optional().meta({
		description:
			"Number of days the customer has to pay the replacement invoice. Defaults to the original invoice's due date; required when that date has already passed. A card-charged invoice has no due date and its replacement is charged immediately; setting this makes the replacement a send-invoice one instead.",
	}),
	preview: z.boolean().optional().meta({
		description:
			"If true, returns the replacement invoice's lines and totals without voiding anything or issuing it.",
	}),
	update_customer_email: z.email().optional().meta({
		description:
			"Updates the customer's billing email before the replacement is issued, so Stripe sends the new invoice to this address.",
	}),
	invoice: ReissueInvoiceOverridesSchema.optional().meta({
		description: "Changes that apply to the replacement invoice only.",
	}),
	customer: ReissueCustomerOverridesSchema.optional().meta({
		description:
			"Changes written to the customer, which the replacement snapshots and later invoices inherit.",
	}),
	lines: ReissueLineEditsSchema.optional().meta({
		description: "Add, change or drop lines relative to the original.",
	}),
});

export const ReissueInvoiceResponseSchema = z.object({
	invoice: ApiListInvoiceV1Schema.nullable().meta({
		description: "The replacement invoice. Null when preview is true.",
	}),
	voided_invoice_id: z.string().nullable().meta({
		description:
			"The Autumn ID of the original invoice, now void. Null when previewing, and when the original was paid and got a credit note instead.",
	}),
	credit_note_id: z.string().nullable().meta({
		description:
			"The Stripe credit note issued against a paid original, whose amount lands on the customer's balance and covers the replacement. Null when the original was open and voided instead.",
	}),
	preview: CreateInvoicePreviewSchema.meta({
		description: "The replacement's lines and totals.",
	}),
});

export type ReissueInvoiceOverrides = z.infer<
	typeof ReissueInvoiceOverridesSchema
>;
export type ReissueCustomerOverrides = z.infer<
	typeof ReissueCustomerOverridesSchema
>;
export type ReissueLineEdits = z.infer<typeof ReissueLineEditsSchema>;
export type ReissueInvoiceParams = z.infer<typeof ReissueInvoiceParamsSchema>;
export type ReissueInvoiceResponse = z.infer<
	typeof ReissueInvoiceResponseSchema
>;
