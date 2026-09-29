import type Stripe from "stripe";

/** Only rawRequest is exposed so reads cannot reach typed write helpers. */
export type StripeReadClient = {
	stripe: Pick<Stripe, "rawRequest">;
	stripeAccount: string | undefined;
	platformKeyed: boolean;
};
