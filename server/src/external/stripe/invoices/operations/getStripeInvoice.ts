import type Stripe from "stripe";

// Map expand strings to their expanded types
type InvoiceExpandMap = {
	payments: { payments: Stripe.ApiList<Stripe.InvoicePayment> };
	discounts: { discounts: Stripe.Discount[] };
	"discounts.source.coupon": {
		discounts: (Stripe.Discount & { source: { coupon: Stripe.Coupon } })[];
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

/** Dynamically typed Stripe invoice based on expand params */
export const getStripeInvoice = async <T extends InvoiceExpandKey[]>({
	stripeClient,
	invoiceId,
	expand,
}: {
	stripeClient: Stripe;
	invoiceId: string;
	expand: T;
}): Promise<ExpandedStripeInvoice<T>> => {
	const invoice = await stripeClient.invoices.retrieve(invoiceId, {
		expand: expand as string[],
	});
	return invoice as unknown as ExpandedStripeInvoice<T>;
};
