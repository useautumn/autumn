import {
	BILLING_DETAILS_ADDRESS_FIELDS,
	BILLING_DETAILS_LABELS,
	type BillingDetailsParams,
	BillingDetailsParamsSchema,
	type BillingDetailsTaxId,
	TAX_EXEMPT_LABELS,
	TAX_ID_CHANGE_LABELS,
} from "@autumn/shared";

type BillingDetailsField = { label: string; value: string };
type TaxIdChanges = NonNullable<BillingDetailsParams["tax_ids"]>;
type CustomFields = NonNullable<
	BillingDetailsParams["invoice_settings"]
>["custom_fields"];

const addressText = (address: BillingDetailsParams["address"]) => {
	if (!address) return BILLING_DETAILS_LABELS.cleared;
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
		return [
			{
				label: BILLING_DETAILS_LABELS.customFields,
				value: BILLING_DETAILS_LABELS.cleared,
			},
		];
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
		fields.push({
			label: BILLING_DETAILS_LABELS.address,
			value: addressText(address),
		});
	}
	fields.push(...taxIdFields(tax_ids));
	if (tax_exempt) {
		fields.push({
			label: BILLING_DETAILS_LABELS.taxExempt,
			value: TAX_EXEMPT_LABELS[tax_exempt],
		});
	}
	if (invoice_settings?.custom_fields !== undefined) {
		fields.push(...customFieldEntries(invoice_settings.custom_fields));
	}

	return fields;
};
