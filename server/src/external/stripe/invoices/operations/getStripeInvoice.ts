import type Stripe from "stripe";
import { isStripeResourceMissing } from "../../common/utils/isStripeResourceMissing.js";

// Helper type for InvoicePayment with expanded payment intent
type InvoicePaymentWithExpandedPaymentIntent = Omit<
	Stripe.InvoicePayment,
	"payment"
> & {
	payment: {
		payment_intent: Stripe.PaymentIntent;
		type: "payment_intent";
	};
};

// Map expand strings to their expanded types
type InvoiceExpandMap = {
	payments: { payments: Stripe.ApiList<Stripe.InvoicePayment> };
	"payments.data.payment.payment_intent": {
		payments: Stripe.ApiList<InvoicePaymentWithExpandedPaymentIntent>;
	};
	discounts: { discounts: Stripe.Discount[] };
	"discounts.source.coupon": {
		discounts: (Stripe.Discount & { source: { coupon: Stripe.Coupon } })[];
	};
	total_discount_amounts: {
		total_discount_amounts: Stripe.Invoice.TotalDiscountAmount[];
	};
	"total_discount_amounts.discount": {
		total_discount_amounts: (Omit<
			Stripe.Invoice.TotalDiscountAmount,
			"discount"
		> & { discount: Stripe.Discount })[];
	};
};

type InvoiceExpandKey = keyof InvoiceExpandMap;

// Converts union to intersection: A | B → A & B
type UnionToIntersection<U> = (
	U extends unknown
		? (x: U) => void
		: never
) extends (x: infer R) => void
	? R
	: never;

export type ExpandedStripeInvoice<T extends InvoiceExpandKey[]> =
	Stripe.Invoice & UnionToIntersection<InvoiceExpandMap[T[number]]>;

type GetStripeInvoiceParams<T extends InvoiceExpandKey[]> = {
	stripeClient: Stripe;
	invoiceId: string;
	expand: T;
};

/** Dynamically typed Stripe invoice based on expand params. `errorOnNotFound: false` returns undefined for a missing invoice instead of throwing. */
export function getStripeInvoice<T extends InvoiceExpandKey[]>(
	params: GetStripeInvoiceParams<T> & { errorOnNotFound?: true },
): Promise<ExpandedStripeInvoice<T>>;
export function getStripeInvoice<T extends InvoiceExpandKey[]>(
	params: GetStripeInvoiceParams<T> & { errorOnNotFound: false },
): Promise<ExpandedStripeInvoice<T> | undefined>;
export async function getStripeInvoice<T extends InvoiceExpandKey[]>({
	stripeClient,
	invoiceId,
	expand,
	errorOnNotFound = true,
}: GetStripeInvoiceParams<T> & { errorOnNotFound?: boolean }): Promise<
	ExpandedStripeInvoice<T> | undefined
> {
	try {
		const invoice = await stripeClient.invoices.retrieve(invoiceId, {
			expand: expand as string[],
		});
		return invoice as unknown as ExpandedStripeInvoice<T>;
	} catch (error) {
		if (!errorOnNotFound && isStripeResourceMissing(error)) return undefined;
		throw error;
	}
}
