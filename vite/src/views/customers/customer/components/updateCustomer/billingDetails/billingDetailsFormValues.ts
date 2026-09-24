import {
	type ApiBillingDetails,
	BILLING_DETAILS_ADDRESS_FIELDS,
	type BillingDetailsParams,
	type BillingDetailsTaxId,
	taxIdKey,
} from "@autumn/shared";

type AddressField = (typeof BILLING_DETAILS_ADDRESS_FIELDS)[number];
type Row = Record<string, string>;

export type BillingDetailsFormValues = {
	address: Record<AddressField, string>;
	tax_ids: BillingDetailsTaxId[];
	tax_exempt: NonNullable<ApiBillingDetails["tax_exempt"]>;
	custom_fields: ApiBillingDetails["invoice_settings"]["custom_fields"];
};

export const billingDetailsToFormValues = (
	billingDetails: ApiBillingDetails | null | undefined,
): BillingDetailsFormValues => ({
	address: Object.fromEntries(
		BILLING_DETAILS_ADDRESS_FIELDS.map((key) => [
			key,
			billingDetails?.address?.[key] ?? "",
		]),
	) as BillingDetailsFormValues["address"],
	tax_ids: billingDetails?.tax_ids ?? [],
	tax_exempt: billingDetails?.tax_exempt ?? "none",
	custom_fields: billingDetails?.invoice_settings.custom_fields ?? [],
});

const trimRow = <T extends Row>(row: T) =>
	Object.fromEntries(
		Object.entries(row).map(([key, value]) => [key, value.trim()]),
	) as T;

/** Trimmed rows with a value; blank rows the user added but never filled are dropped. */
const filledRows = <T extends Row & { value: string }>(rows: T[]) =>
	rows.map(trimRow).filter((row) => row.value !== "");

const isSame = (a: unknown, b: unknown) =>
	JSON.stringify(a) === JSON.stringify(b);

const addressChange = (address: BillingDetailsFormValues["address"]) => {
	const trimmed = trimRow(address);
	const isEmpty = Object.values(trimmed).every((value) => value === "");
	if (isEmpty) return null;
	return Object.fromEntries(
		Object.entries(trimmed).map(([key, value]) => [key, value || null]),
	);
};

const taxIdsMissingFrom = (
	taxIds: BillingDetailsTaxId[],
	other: BillingDetailsTaxId[],
) => {
	const otherKeys = new Set(other.map(taxIdKey));
	return taxIds.filter((taxId) => !otherKeys.has(taxIdKey(taxId)));
};

/** Stripe tax IDs can't be edited, so an edited row becomes a remove plus an add. */
const taxIdChanges = ({
	initial,
	current,
}: {
	initial: BillingDetailsTaxId[];
	current: BillingDetailsTaxId[];
}): BillingDetailsParams["tax_ids"] => {
	const filled = filledRows(current);
	const add = taxIdsMissingFrom(filled, initial);
	const remove = taxIdsMissingFrom(initial, filled);
	if (add.length === 0 && remove.length === 0) return undefined;
	return {
		...(add.length > 0 && { add }),
		...(remove.length > 0 && { remove }),
	};
};

/** Only the fields the user edited, so untouched Stripe data is never rewritten. */
export const billingDetailsChanges = ({
	initial,
	current,
}: {
	initial: BillingDetailsFormValues;
	current: BillingDetailsFormValues;
}): BillingDetailsParams | undefined => {
	const changes: BillingDetailsParams = {};

	const address = addressChange(current.address);
	if (!isSame(address, addressChange(initial.address))) {
		changes.address = address;
	}

	const taxIds = taxIdChanges({
		initial: initial.tax_ids,
		current: current.tax_ids,
	});
	if (taxIds) changes.tax_ids = taxIds;

	if (current.tax_exempt !== initial.tax_exempt) {
		changes.tax_exempt = current.tax_exempt;
	}

	const customFields = filledRows(current.custom_fields);
	if (!isSame(customFields, initial.custom_fields)) {
		changes.invoice_settings = {
			custom_fields: customFields.length > 0 ? customFields : null,
		};
	}

	return Object.keys(changes).length > 0 ? changes : undefined;
};
