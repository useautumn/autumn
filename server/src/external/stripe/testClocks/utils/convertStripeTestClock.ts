import { AppEnv } from "@autumn/shared";
import { tryCatch } from "@shared/utils";
import type { Stripe } from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import {
	getCachedStripeTestClockId,
	setCachedStripeTestClockId,
} from "@/external/redis/actions/stripeTestClockCache/stripeTestClockCache";
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

	// 1. Cached answer: most sandbox customers have no clock, so this skips a Stripe call per page load
	const cachedClockId = await getCachedStripeTestClockId({
		stripeCustomerId,
		requestId: ctx.id,
	});
	if (cachedClockId === null) return undefined;
	if (cachedClockId) {
		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const { data: clock } = await tryCatch(
			stripeCli.testHelpers.testClocks.retrieve(cachedClockId),
		);
		if (clock) return clock.frozen_time * 1000;
	}

	// 2. Miss, or the cached clock is gone: read the customer and cache what it has
	const stripeCus = await getExpandedStripeCustomer({
		ctx,
		stripeCustomerId,
		errorOnNotFound: false,
	});
	if (!stripeCus) return undefined;

	await setCachedStripeTestClockId({
		stripeCustomerId,
		testClockId: stripeCus.test_clock?.id ?? null,
		requestId: ctx.id,
	});
	if (!stripeCus.test_clock) return undefined;
	return stripeCus.test_clock.frozen_time * 1000;
};
