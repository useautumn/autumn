import type Stripe from "stripe";

export type StripeReadClient = {
	stripe: Pick<Stripe, "rawRequest">;
	stripeAccount: string | undefined;
	platformKeyed: boolean;
};
