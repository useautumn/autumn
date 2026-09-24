import {
	type BillingDetailsParams,
	BillingDetailsParamsSchema,
	TAX_EXEMPT_LABELS,
} from "@autumn/shared";

type BillingDetailsField = { label: string; value: string };

const CLEARED = "Cleared";

const addressText = (address: BillingDetailsParams["address"]) => {
	if (!address) return CLEARED;
	const { line1, line2, city, state, postal_code, country } = address;
	return [line1, line2, city, state, postal_code, country]
		.filter(Boolean)
		.join(", ");
};

const taxIdText = ({ type, value }: { type: string; value: string }) =>
	`${type.replace(/_/g, " ").toUpperCase()} ${value}`;

const customFieldEntries = (
	customFields: NonNullable<
		BillingDetailsParams["invoice_settings"]
	>["custom_fields"],
): BillingDetailsField[] => {
	if (!customFields?.length) {
		return [{ label: "Invoice custom fields", value: CLEARED }];
	}
	return customFields.map(({ name, value }) => ({ label: name, value }));
};

/** Flattens billing_details into one approval field per change so reviewers see real values. */
export const billingDetailsFields = (value: unknown): BillingDetailsField[] => {
	const parsed = BillingDetailsParamsSchema.safeParse(value);
	if (!parsed.success) return [];

	const { address, tax_ids, tax_exempt, invoice_settings } = parsed.data;
	const fields: BillingDetailsField[] = [];

	if (address !== undefined) {
		fields.push({ label: "Address", value: addressText(address) });
	}
	if (tax_ids?.add?.length) {
		fields.push({
			label: "Add tax IDs",
			value: tax_ids.add.map(taxIdText).join(", "),
		});
	}
	if (tax_ids?.remove?.length) {
		fields.push({
			label: "Remove tax IDs",
			value: tax_ids.remove.map(taxIdText).join(", "),
		});
	}
	if (tax_exempt) {
		fields.push({ label: "Tax exempt", value: TAX_EXEMPT_LABELS[tax_exempt] });
	}
	if (invoice_settings?.custom_fields !== undefined) {
		fields.push(...customFieldEntries(invoice_settings.custom_fields));
	}

	return fields;
};
