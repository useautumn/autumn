import type Stripe from "stripe";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import {
	STRIPE_LIST_PAGE_SIZE,
	STRIPE_SWEEP_CONCURRENCY,
} from "./billingVerifyExportConfig.js";
import { stripeCreatedWindows } from "./stripeCreatedWindows.js";

const listTestClockIds = async ({ stripeCli }: { stripeCli: Stripe }) => {
	const testClockIds: string[] = [];
	const testClocks = stripeCli.testHelpers.testClocks.list({
		limit: STRIPE_LIST_PAGE_SIZE,
	});
	for await (const testClock of testClocks) testClockIds.push(testClock.id);
	return testClockIds;
};

/** One org-wide listing replaces a Stripe call per customer, fetched as
 * concurrent created-range windows. Stripe leaves test-clock subscriptions
 * out of it, so sandbox sweeps each clock as well. */
export const sweepStripeSubscriptions = async ({
	stripeCli,
	includeTestClocks,
	sinceMs,
	untilMs,
	onPage,
}: {
	stripeCli: Stripe;
	includeTestClocks: boolean;
	sinceMs: number;
	untilMs: number;
	onPage?: (subscriptionCount: number) => Promise<void> | void;
}): Promise<Map<string, Stripe.Subscription[]>> => {
	const subscriptionsByStripeCustomerId = new Map<
		string,
		Stripe.Subscription[]
	>();

	const collect = async (
		params: Pick<Stripe.SubscriptionListParams, "created" | "test_clock">,
	) => {
		let startingAfter: string | undefined;
		while (true) {
			const page = await stripeCli.subscriptions.list({
				...params,
				limit: STRIPE_LIST_PAGE_SIZE,
				starting_after: startingAfter,
			});
			for (const subscription of page.data) {
				const stripeCustomerId =
					typeof subscription.customer === "string"
						? subscription.customer
						: subscription.customer.id;
				const existing = subscriptionsByStripeCustomerId.get(stripeCustomerId);
				if (existing) existing.push(subscription);
				else
					subscriptionsByStripeCustomerId.set(stripeCustomerId, [subscription]);
			}
			await onPage?.(page.data.length);
			if (!page.has_more) return;
			startingAfter = page.data[page.data.length - 1]?.id;
		}
	};

	await mapWithConcurrency({
		items: stripeCreatedWindows({ sinceMs, untilMs }),
		concurrency: STRIPE_SWEEP_CONCURRENCY,
		run: (created) => collect({ created }),
	});
	if (includeTestClocks) {
		await mapWithConcurrency({
			items: await listTestClockIds({ stripeCli }),
			concurrency: STRIPE_SWEEP_CONCURRENCY,
			run: (testClockId) => collect({ test_clock: testClockId }),
		});
	}

	return subscriptionsByStripeCustomerId;
};
