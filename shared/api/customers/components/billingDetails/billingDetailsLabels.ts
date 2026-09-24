import type {
	BILLING_DETAILS_ADDRESS_FIELDS,
	BillingDetailsParams,
	TAX_EXEMPT_VALUES,
} from "./billingDetails";

export const BILLING_DETAILS_LABELS = {
	section: "Billing Details",
	address: "Address",
	taxIds: "Tax IDs",
	taxExempt: "Tax exempt",
	customFields: "Invoice custom fields",
	addTaxId: "Add tax ID",
	addCustomField: "Add custom field",
	cleared: "Cleared",
} as const;

export const BILLING_DETAILS_ADDRESS_LABELS: Record<
	(typeof BILLING_DETAILS_ADDRESS_FIELDS)[number],
	string
> = {
	line1: "Address line 1",
	line2: "Address line 2",
	city: "City",
	state: "State",
	postal_code: "Postal code",
	country: "Country",
};

export const TAX_EXEMPT_LABELS: Record<
	(typeof TAX_EXEMPT_VALUES)[number],
	string
> = {
	none: "Not exempt",
	exempt: "Exempt",
	reverse: "Reverse charge",
};

export const TAX_ID_CHANGE_LABELS: Record<
	keyof NonNullable<BillingDetailsParams["tax_ids"]>,
	string
> = {
	add: "Add tax IDs",
	remove: "Remove tax IDs",
};
