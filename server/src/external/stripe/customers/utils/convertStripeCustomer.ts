import type { Stripe } from "stripe";
import { stripeTestClockToNowMs } from "@/external/stripe/testClocks/utils/convertStripeTestClock";

/**
 * Gets the current time in milliseconds from a Stripe customer, respecting test clocks.
 * @param stripeCli - The Stripe client.
 * @param stripeCustomer - The Stripe customer.
 * @returns The current time in milliseconds.
 */

export const stripeCustomerToNowMs = async ({
	stripeCli,
	stripeCustomer,
}: {
	stripeCli: Stripe;
	stripeCustomer: Stripe.Customer;
}) => {
	if (stripeCustomer.livemode) {
		return Date.now();
	}

	const testClock = stripeCustomer.test_clock;

	return stripeTestClockToNowMs({
		stripeCli,
		testClock: testClock ?? undefined,
	});
};
