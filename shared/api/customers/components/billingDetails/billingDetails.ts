import { z } from "zod/v4";

export const MAX_INVOICE_CUSTOM_FIELDS = 4;
export const MAX_INVOICE_CUSTOM_FIELD_NAME_LENGTH = 40;
export const MAX_INVOICE_CUSTOM_FIELD_VALUE_LENGTH = 140;

export const TAX_EXEMPT_VALUES = ["none", "exempt", "reverse"] as const;

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

export const BILLING_DETAILS_ADDRESS_FIELDS =
	BillingDetailsAddressSchema.keyof().options;

export const BillingDetailsTaxIdSchema = z
	.object({
		type: z.string().meta({
			description:
				"Stripe tax ID type, e.g. eu_vat, gb_vat, us_ein. See https://docs.stripe.com/billing/customer/tax-ids#supported-tax-id",
		}),
		value: z.string().meta({ description: "The tax ID, e.g. DE123456789." }),
	})
	.meta({ title: "BillingDetailsTaxId" });

export type BillingDetailsTaxId = z.infer<typeof BillingDetailsTaxIdSchema>;

export const taxIdKey = ({ type, value }: BillingDetailsTaxId) =>
	`${type}:${value}`;

export const BillingDetailsCustomFieldSchema = z
	.object({
		name: z
			.string()
			.max(MAX_INVOICE_CUSTOM_FIELD_NAME_LENGTH)
			.meta({ description: "Label, e.g. PO Number." }),
		value: z.string().max(MAX_INVOICE_CUSTOM_FIELD_VALUE_LENGTH),
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

export const TaxExemptSchema = z.enum(TAX_EXEMPT_VALUES);

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
					.max(MAX_INVOICE_CUSTOM_FIELDS)
					.nullish()
					.meta({
						description: `Up to ${MAX_INVOICE_CUSTOM_FIELDS} custom fields shown on every invoice, e.g. a PO number. Replaces the existing list; null clears it.`,
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

/** The expand field, shared by every customer response version. */
export const ApiBillingDetailsExpandSchema =
	ApiBillingDetailsSchema.nullish().meta({
		description:
			"Billing details from the linked Stripe customer. Returned only if billing_details is provided in the expand parameter.",
	});

export type BillingDetailsParams = z.infer<typeof BillingDetailsParamsSchema>;
export type ApiBillingDetails = z.infer<typeof ApiBillingDetailsSchema>;
