import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

// Map expand strings to their expanded types
type CheckoutSessionExpandMap = {
	line_items: { line_items: Stripe.ApiList<Stripe.LineItem> };
	subscription: { subscription: Stripe.Subscription | null };
	invoice: { invoice: Stripe.Invoice | null };
	customer: { customer: Stripe.Customer | Stripe.DeletedCustomer | null };
	payment_intent: { payment_intent: Stripe.PaymentIntent | null };
	setup_intent: { setup_intent: Stripe.SetupIntent | null };
};

type CheckoutSessionExpandKey = keyof CheckoutSessionExpandMap;

// Converts union to intersection: A | B → A & B
type UnionToIntersection<U> = (
	U extends unknown
		? (x: U) => void
		: never
) extends (x: infer R) => void
	? R
	: never;

export type ExpandedStripeCheckoutSession<
	T extends CheckoutSessionExpandKey[],
> = Stripe.Checkout.Session &
	UnionToIntersection<CheckoutSessionExpandMap[T[number]]>;

/** Dynamically typed Stripe checkout session based on expand params */
export const getStripeCheckoutSession = async <
	T extends CheckoutSessionExpandKey[],
>({
	ctx,
	checkoutSessionId,
	expand,
}: {
	ctx: AutumnContext;
	checkoutSessionId: string;
	expand: T;
}): Promise<ExpandedStripeCheckoutSession<T>> => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const checkoutSession = await stripeCli.checkout.sessions.retrieve(
		checkoutSessionId,
		{ expand: expand as string[] },
	);
	return checkoutSession as unknown as ExpandedStripeCheckoutSession<T>;
};
