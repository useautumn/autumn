import type Stripe from "stripe";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import {
	STRIPE_LIST_PAGE_SIZE,
	TEST_CLOCK_SWEEP_CONCURRENCY,
} from "./billingVerifyExportConfig.js";

const listTestClockIds = async ({ stripeCli }: { stripeCli: Stripe }) => {
	const testClockIds: string[] = [];
	const testClocks = stripeCli.testHelpers.testClocks.list({
		limit: STRIPE_LIST_PAGE_SIZE,
	});
	for await (const testClock of testClocks) testClockIds.push(testClock.id);
	return testClockIds;
};

/** One org-wide listing replaces a Stripe call per customer. Stripe leaves
 * test-clock subscriptions out of it, so sandbox sweeps each clock as well. */
export const sweepStripeSubscriptions = async ({
	stripeCli,
	includeTestClocks,
}: {
	stripeCli: Stripe;
	includeTestClocks: boolean;
}): Promise<Map<string, Stripe.Subscription[]>> => {
	const subscriptionsByStripeCustomerId = new Map<
		string,
		Stripe.Subscription[]
	>();

	const collect = async ({ testClockId }: { testClockId?: string }) => {
		const subscriptions = stripeCli.subscriptions.list({
			limit: STRIPE_LIST_PAGE_SIZE,
			test_clock: testClockId,
		});
		for await (const subscription of subscriptions) {
			const stripeCustomerId =
				typeof subscription.customer === "string"
					? subscription.customer
					: subscription.customer.id;
			const existing = subscriptionsByStripeCustomerId.get(stripeCustomerId);
			if (existing) existing.push(subscription);
			else
				subscriptionsByStripeCustomerId.set(stripeCustomerId, [subscription]);
		}
	};

	await collect({});
	if (includeTestClocks) {
		await mapWithConcurrency({
			items: await listTestClockIds({ stripeCli }),
			concurrency: TEST_CLOCK_SWEEP_CONCURRENCY,
			run: (testClockId) => collect({ testClockId }),
		});
	}

	return subscriptionsByStripeCustomerId;
};
