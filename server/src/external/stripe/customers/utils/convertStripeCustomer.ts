import type { Stripe } from "stripe";
import { stripeTestClockToNowMs } from "@/external/stripe/testClocks/utils/convertStripeTestClock";

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
