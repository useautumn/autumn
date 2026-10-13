import type { InvoicePaymentMethod } from "@autumn/shared";
import { INVOICE_PAYMENT_METHOD_OPTIONS } from "@/utils/invoicePaymentMethodOptions";

/** Unticking the last method cycles back to the prefilled methods, since Stripe rejects an empty list. */
export const nextPaymentMethodTypes = ({
	selected,
	type,
	checked,
	original,
}: {
	selected: InvoicePaymentMethod[];
	type: InvoicePaymentMethod;
	checked: boolean;
	original: InvoicePaymentMethod[] | null;
}): InvoicePaymentMethod[] | null => {
	const next = INVOICE_PAYMENT_METHOD_OPTIONS.map(
		(option) => option.value,
	).filter((option) => (option === type ? checked : selected.includes(option)));
	if (next.length > 0) return next;
	return original?.length ? original : null;
};
