import type Stripe from "stripe";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import { retryBoundedAsync } from "@/utils/retryBoundedAsync.js";
import {
	billingVerifyExportConfig,
	type SweepLimits,
} from "./billingVerifyExportConfig.js";
import { listStripeSubscriptionPage } from "./listStripeSubscriptionPage.js";
import { stripeCreatedWindows } from "./stripeCreatedWindows.js";

const listTestClockIds = async ({
	stripeCli,
	limits,
}: {
	stripeCli: Stripe;
	limits?: SweepLimits;
}) => {
	const {
		pageSize,
		pageTimeoutMs,
		pageAttempts,
		retryDelayMs,
		maxRetryDelayMs,
	} = {
		...billingVerifyExportConfig.sweep,
		...limits,
	};
	const testClockIds: string[] = [];
	let startingAfter: string | undefined;

	while (true) {
		const page = await retryBoundedAsync({
			attempts: pageAttempts,
			delayMs: retryDelayMs,
			maxDelayMs: maxRetryDelayMs,
			timeoutMs: pageTimeoutMs,
			timeoutMessage: `Stripe test clock page timed out after ${pageTimeoutMs}ms`,
			run: () =>
				stripeCli.testHelpers.testClocks.list({
					limit: pageSize,
					starting_after: startingAfter,
				}),
		});
		for (const testClock of page.data) testClockIds.push(testClock.id);
		if (!page.has_more) return testClockIds;
		startingAfter = page.data[page.data.length - 1]?.id;
	}
};

/** One org-wide listing replaces a Stripe call per customer, fetched as
 * concurrent created-range windows. Stripe leaves test-clock subscriptions
 * out of it, so sandbox sweeps each clock as well. */
export const sweepStripeSubscriptions = async ({
	stripeCli,
	includeTestClocks,
	sinceMs,
	untilMs,
	limits,
	onPage,
	onRetry,
}: {
	stripeCli: Stripe;
	includeTestClocks: boolean;
	sinceMs: number;
	untilMs: number;
	limits?: SweepLimits;
	onPage?: (subscriptionCount: number) => Promise<void> | void;
	onRetry?: ({ attempt, error }: { attempt: number; error: unknown }) => void;
}): Promise<Map<string, Stripe.Subscription[]>> => {
	const { concurrency, windowMonths } = {
		...billingVerifyExportConfig.sweep,
		...limits,
	};
	const subscriptionsByStripeCustomerId = new Map<
		string,
		Stripe.Subscription[]
	>();

	const collect = async (
		params: Pick<Stripe.SubscriptionListParams, "created" | "test_clock">,
	) => {
		let startingAfter: string | undefined;
		while (true) {
			const page = await listStripeSubscriptionPage({
				stripeCli,
				params,
				startingAfter,
				limits,
				onRetry,
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
		items: stripeCreatedWindows({ sinceMs, untilMs, windowMonths }),
		concurrency,
		run: (created) => collect({ created }),
	});
	if (includeTestClocks) {
		await mapWithConcurrency({
			items: await listTestClockIds({ stripeCli, limits }),
			concurrency,
			run: (testClockId) => collect({ test_clock: testClockId }),
		});
	}

	return subscriptionsByStripeCustomerId;
};
