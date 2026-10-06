import {
	type BillingDetailsBillingParams,
	STRIPE_TAX_ID_OPTIONS,
} from "@autumn/shared";

export interface InvoiceBillingDetailsForm {
	country: string;
	address: string;
	city: string;
	state: string;
	postalCode: string;
	taxIdOptionId: string | null;
	taxIdValue: string;
	taxExempt: "none" | "exempt" | "reverse";
}

export const EMPTY_INVOICE_BILLING_DETAILS: InvoiceBillingDetailsForm = {
	country: "",
	address: "",
	city: "",
	state: "",
	postalCode: "",
	taxIdOptionId: null,
	taxIdValue: "",
	taxExempt: "none",
};

const trimmedOrUndefined = (value: string) => value.trim() || undefined;

export const hasInvoiceBillingDetails = (form: InvoiceBillingDetailsForm) =>
	Boolean(form.country) || form.taxExempt !== "none";

/** Maps the Send Invoice address form to `billing_details`; Stripe has two address lines. */
export const invoiceBillingDetailsToParams = (
	form: InvoiceBillingDetailsForm,
): BillingDetailsBillingParams | undefined => {
	if (!hasInvoiceBillingDetails(form)) return undefined;

	const [line1 = "", ...rest] = form.address.split("\n");
	const taxIdOption = STRIPE_TAX_ID_OPTIONS.find(
		(option) => option.id === form.taxIdOptionId,
	);
	const taxIdValue = form.taxIdValue.trim();

	// Exempt hides the address fields, so never send an address the user can't see.
	const sendsAddress = Boolean(form.country) && form.taxExempt !== "exempt";

	return {
		...(sendsAddress
			? {
					address: {
						country: form.country,
						line1: trimmedOrUndefined(line1),
						line2: trimmedOrUndefined(rest.join(" ")),
						city: trimmedOrUndefined(form.city),
						state: trimmedOrUndefined(form.state),
						postal_code: trimmedOrUndefined(form.postalCode),
					},
				}
			: {}),
		...(taxIdOption && taxIdValue
			? { tax_ids: [{ type: taxIdOption.type, value: taxIdValue }] }
			: {}),
		...(form.taxExempt !== "none" ? { tax_exempt: form.taxExempt } : {}),
	};
};
