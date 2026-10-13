import type { InvoicePaymentMethod } from "@autumn/shared";
import { INVOICE_PAYMENT_METHOD_OPTIONS } from "@/utils/invoicePaymentMethodOptions";

export const DEFAULT_PAYMENT_METHODS = "default";

export type PaymentMethodChoice =
	| InvoicePaymentMethod
	| typeof DEFAULT_PAYMENT_METHODS;

/** The selection after a menu choice; undefined means leave it unchanged. */
export const nextPaymentMethodTypes = ({
	selected,
	choice,
	checked,
}: {
	selected: InvoicePaymentMethod[];
	choice: PaymentMethodChoice;
	checked: boolean;
}): InvoicePaymentMethod[] | null | undefined => {
	if (choice === DEFAULT_PAYMENT_METHODS) return null;
	const next = INVOICE_PAYMENT_METHOD_OPTIONS.map(
		(option) => option.value,
	).filter((option) =>
		option === choice ? checked : selected.includes(option),
	);
	// Stripe rejects an empty list, so the last type cannot be removed.
	return next.length > 0 ? next : undefined;
};
