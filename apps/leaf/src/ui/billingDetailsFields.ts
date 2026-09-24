import {
	BILLING_DETAILS_ADDRESS_FIELDS,
	type BillingDetailsParams,
	BillingDetailsParamsSchema,
	type BillingDetailsTaxId,
	TAX_EXEMPT_LABELS,
} from "@autumn/shared";

type BillingDetailsField = { label: string; value: string };
type TaxIdChanges = NonNullable<BillingDetailsParams["tax_ids"]>;
type CustomFields = NonNullable<
	BillingDetailsParams["invoice_settings"]
>["custom_fields"];

const CLEARED = "Cleared";

const TAX_ID_CHANGE_LABELS: Record<keyof TaxIdChanges, string> = {
	add: "Add tax IDs",
	remove: "Remove tax IDs",
};

const addressText = (address: BillingDetailsParams["address"]) => {
	if (!address) return CLEARED;
	return BILLING_DETAILS_ADDRESS_FIELDS.map((key) => address[key])
		.filter(Boolean)
		.join(", ");
};

const taxIdText = ({ type, value }: BillingDetailsTaxId) =>
	`${type.replace(/_/g, " ").toUpperCase()} ${value}`;

const taxIdFields = (taxIds: TaxIdChanges = {}): BillingDetailsField[] =>
	(Object.keys(TAX_ID_CHANGE_LABELS) as (keyof TaxIdChanges)[]).flatMap(
		(change) =>
			taxIds[change]?.length
				? [
						{
							label: TAX_ID_CHANGE_LABELS[change],
							value: taxIds[change].map(taxIdText).join(", "),
						},
					]
				: [],
	);

const customFieldEntries = (
	customFields: CustomFields,
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
	fields.push(...taxIdFields(tax_ids));
	if (tax_exempt) {
		fields.push({ label: "Tax exempt", value: TAX_EXEMPT_LABELS[tax_exempt] });
	}
	if (invoice_settings?.custom_fields !== undefined) {
		fields.push(...customFieldEntries(invoice_settings.custom_fields));
	}

	return fields;
};
