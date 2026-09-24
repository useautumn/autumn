import { z } from "zod/v4";

export const BillingDetailsAddressSchema = z
	.object({
		line1: z.string().nullish(),
		line2: z.string().nullish(),
		city: z.string().nullish(),
		state: z.string().nullish(),
		postal_code: z.string().nullish(),
		country: z.string().nullish().meta({
			description: "Two-letter country code (ISO 3166-1 alpha-2).",
		}),
	})
	.meta({ title: "BillingDetailsAddress" });

export const BillingDetailsTaxIdSchema = z
	.object({
		type: z.string().meta({
			description:
				"Stripe tax ID type, e.g. eu_vat, gb_vat, us_ein. See https://docs.stripe.com/billing/customer/tax-ids#supported-tax-id",
		}),
		value: z.string().meta({ description: "The tax ID, e.g. DE123456789." }),
	})
	.meta({ title: "BillingDetailsTaxId" });

export const BillingDetailsCustomFieldSchema = z
	.object({
		name: z.string().meta({ description: "Label, e.g. PO Number." }),
		value: z.string(),
	})
	.meta({ title: "BillingDetailsCustomField" });

export const BillingDetailsTaxIdChangesSchema = z
	.object({
		add: z.array(BillingDetailsTaxIdSchema).optional().meta({
			description: "Tax IDs to add. IDs the customer already has are ignored.",
		}),
		remove: z.array(BillingDetailsTaxIdSchema).optional().meta({
			description:
				"Tax IDs to remove, matched by type and value. IDs the customer doesn't have are ignored.",
		}),
	})
	.meta({ title: "BillingDetailsTaxIdChanges" });

export const TaxExemptSchema = z.enum(["none", "exempt", "reverse"]);

export const TAX_EXEMPT_LABELS: Record<
	z.infer<typeof TaxExemptSchema>,
	string
> = {
	none: "Not exempt",
	exempt: "Exempt",
	reverse: "Reverse charge",
};

export const BillingDetailsParamsSchema = z
	.object({
		address: BillingDetailsAddressSchema.nullish().meta({
			description:
				"Billing address, used for tax and shown on invoices. Replaces the whole address, as in Stripe; null clears it.",
		}),
		tax_ids: BillingDetailsTaxIdChangesSchema.optional().meta({
			description:
				"Tax IDs to add or remove (e.g. VAT). Stripe tax IDs cannot be edited, so change one by removing the old ID and adding the new one. IDs not listed are kept.",
		}),
		tax_exempt: TaxExemptSchema.optional().meta({
			description:
				"Tax exemption status. Use reverse for reverse-charge customers.",
		}),
		invoice_settings: z
			.object({
				custom_fields: z
					.array(BillingDetailsCustomFieldSchema)
					.max(4)
					.nullish()
					.meta({
						description:
							"Up to 4 custom fields shown on every invoice, e.g. a PO number. Replaces the existing list; null clears it.",
					}),
			})
			.optional(),
	})
	.meta({
		title: "BillingDetailsParams",
		description:
			"Billing details stored on the linked Stripe customer. Requires a Stripe customer.",
	});

export const ApiBillingDetailsSchema = z
	.object({
		address: BillingDetailsAddressSchema.nullable(),
		tax_ids: z.array(BillingDetailsTaxIdSchema),
		tax_exempt: TaxExemptSchema.nullable(),
		invoice_settings: z.object({
			custom_fields: z.array(BillingDetailsCustomFieldSchema),
		}),
	})
	.meta({
		title: "BillingDetails",
		description:
			"Billing details read live from the linked Stripe customer. Null when no Stripe customer is linked.",
	});

export type BillingDetailsParams = z.infer<typeof BillingDetailsParamsSchema>;
export type ApiBillingDetails = z.infer<typeof ApiBillingDetailsSchema>;
