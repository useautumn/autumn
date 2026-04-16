import { AppEnv } from "@autumn/shared";
import type { Stripe } from "stripe";
import { getExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Gets the current time in milliseconds from a Stripe test clock.
 * Accepts either a test clock ID (string) or an expanded TestClock object.
 * Falls back to Date.now() if no test clock is provided or retrieval fails.
 */
export const stripeTestClockToNowMs = async ({
	stripeCli,
	testClock,
}: {
	stripeCli: Stripe;
	testClock?: string | Stripe.TestHelpers.TestClock;
}): Promise<number> => {
	if (testClock) {
		try {
			if (typeof testClock === "string") {
				const stripeClock =
					await stripeCli.testHelpers.testClocks.retrieve(testClock);
				return stripeClock.frozen_time * 1000;
			}
			return testClock.frozen_time * 1000;
		} catch {}
	}

	return Date.now();
};

/** Resolves the test clock frozen time for a Stripe customer, or undefined if none. */
export const getTestClockFrozenTimeMs = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	stripeCustomerId?: string;
}): Promise<number | undefined> => {
	if (ctx.env === AppEnv.Live || !stripeCustomerId) return undefined;

	const stripeCus = await getExpandedStripeCustomer({
		ctx,
		stripeCustomerId,
		errorOnNotFound: false,
	});

	if (!stripeCus?.test_clock) return undefined;
	return stripeCus.test_clock.frozen_time * 1000;
};
