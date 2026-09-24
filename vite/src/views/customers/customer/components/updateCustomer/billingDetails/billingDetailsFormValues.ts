import type { ApiBillingDetails, BillingDetailsParams } from "@autumn/shared";

export const ADDRESS_FIELDS = [
	"line1",
	"line2",
	"city",
	"state",
	"postal_code",
	"country",
] as const;

type AddressField = (typeof ADDRESS_FIELDS)[number];
type TaxExempt = NonNullable<ApiBillingDetails["tax_exempt"]>;

export type BillingDetailsFormValues = {
	address: Record<AddressField, string>;
	tax_ids: ApiBillingDetails["tax_ids"];
	tax_exempt: TaxExempt;
	custom_fields: ApiBillingDetails["invoice_settings"]["custom_fields"];
};

export const billingDetailsToFormValues = (
	billingDetails: ApiBillingDetails | null | undefined,
): BillingDetailsFormValues => ({
	address: Object.fromEntries(
		ADDRESS_FIELDS.map((key) => [key, billingDetails?.address?.[key] ?? ""]),
	) as BillingDetailsFormValues["address"],
	tax_ids: billingDetails?.tax_ids ?? [],
	tax_exempt: billingDetails?.tax_exempt ?? "none",
	custom_fields: billingDetails?.invoice_settings.custom_fields ?? [],
});

const trimmedAddress = (address: BillingDetailsFormValues["address"]) =>
	Object.fromEntries(
		ADDRESS_FIELDS.map((key) => [key, address[key].trim() || null]),
	) as Record<AddressField, string | null>;

const hasValue = (row: { value: string }) => row.value.trim() !== "";

const isSame = (a: unknown, b: unknown) =>
	JSON.stringify(a) === JSON.stringify(b);

type TaxId = BillingDetailsFormValues["tax_ids"][number];

const taxIdKey = ({ type, value }: TaxId) => `${type.trim()}:${value.trim()}`;

const taxIdsMissingFrom = (taxIds: TaxId[], other: TaxId[]) => {
	const otherKeys = new Set(other.map(taxIdKey));
	return taxIds.filter((taxId) => !otherKeys.has(taxIdKey(taxId)));
};

/** Stripe tax IDs can't be edited, so an edited row becomes a remove plus an add. */
const taxIdChanges = ({
	initial,
	current,
}: {
	initial: TaxId[];
	current: TaxId[];
}): BillingDetailsParams["tax_ids"] => {
	const filled = current.filter(hasValue);
	const add = taxIdsMissingFrom(filled, initial);
	const remove = taxIdsMissingFrom(initial, filled);
	if (add.length === 0 && remove.length === 0) return undefined;
	return {
		...(add.length > 0 && { add }),
		...(remove.length > 0 && { remove }),
	};
};

/** Only the lanes the user edited, so untouched Stripe data is never rewritten. */
export const billingDetailsChanges = ({
	initial,
	current,
}: {
	initial: BillingDetailsFormValues;
	current: BillingDetailsFormValues;
}): BillingDetailsParams | undefined => {
	const changes: BillingDetailsParams = {};

	const address = trimmedAddress(current.address);
	if (!isSame(address, trimmedAddress(initial.address))) {
		const isEmpty = Object.values(address).every((value) => value === null);
		changes.address = isEmpty ? null : address;
	}

	const taxIds = taxIdChanges({
		initial: initial.tax_ids,
		current: current.tax_ids,
	});
	if (taxIds) changes.tax_ids = taxIds;

	if (current.tax_exempt !== initial.tax_exempt) {
		changes.tax_exempt = current.tax_exempt;
	}

	const customFields = current.custom_fields.filter(hasValue);
	if (!isSame(customFields, initial.custom_fields)) {
		changes.invoice_settings = {
			custom_fields: customFields.length > 0 ? customFields : null,
		};
	}

	return Object.keys(changes).length > 0 ? changes : undefined;
};
