import type { Stripe } from "stripe";

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
	// Handle testClock (string or object)
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
