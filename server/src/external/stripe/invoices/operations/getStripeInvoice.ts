import type Stripe from "stripe";
import { isStripeResourceMissing } from "../../common/utils/isStripeResourceMissing.js";

type InvoicePaymentWithExpandedPaymentIntent = Omit<
	Stripe.InvoicePayment,
	"payment"
> & {
	payment: {
		payment_intent: Stripe.PaymentIntent;
		type: "payment_intent";
	};
};

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

type UnionToIntersection<U> = (
	U extends unknown
		? (x: U) => void
		: never
) extends (x: infer R) => void
	? R
	: never;

export type ExpandedStripeInvoice<T extends InvoiceExpandKey[]> =
	Stripe.Invoice & UnionToIntersection<InvoiceExpandMap[T[number]]>;

export const getStripeInvoice = async <
	T extends InvoiceExpandKey[],
	NotFound = never,
>({
	stripeClient,
	invoiceId,
	expand,
	onNotFound,
}: {
	stripeClient: Stripe;
	invoiceId: string;
	expand: T;
	onNotFound?: () => NotFound;
}): Promise<ExpandedStripeInvoice<T> | NotFound> => {
	try {
		const invoice = await stripeClient.invoices.retrieve(invoiceId, {
			expand: expand as string[],
		});
		return invoice as unknown as ExpandedStripeInvoice<T>;
	} catch (error) {
		if (onNotFound && isStripeResourceMissing(error)) return onNotFound();
		throw error;
	}
};
