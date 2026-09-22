import type Stripe from "stripe";
import type { RatePacer } from "@/utils/createRatePacer.js";
import { retryBoundedAsync } from "@/utils/retryBoundedAsync.js";
import {
	billingVerifyExportConfig,
	type SweepLimits,
} from "./billingVerifyExportConfig.js";

/** The Stripe SDK reads a response body with `res.toJSON()`, which registers no
 * error handler, so a body cut off after its headers arrive never settles and
 * the SDK's own timeout and retries never fire. */
export const listStripeSubscriptionPage = async ({
	stripeCli,
	params,
	startingAfter,
	limits,
	pacer,
	onRetry,
}: {
	stripeCli: Stripe;
	params: Pick<Stripe.SubscriptionListParams, "created" | "test_clock">;
	startingAfter?: string;
	limits?: SweepLimits;
	pacer?: RatePacer;
	onRetry?: ({ attempt, error }: { attempt: number; error: unknown }) => void;
}): Promise<Stripe.ApiList<Stripe.Subscription>> => {
	const { pageSize, pageTimeoutMs, pageAttempts, retryDelayMs } = {
		...billingVerifyExportConfig.sweep,
		...limits,
	};

	return retryBoundedAsync({
		attempts: pageAttempts,
		delayMs: retryDelayMs,
		timeoutMs: pageTimeoutMs,
		timeoutMessage: `Stripe subscription page timed out after ${pageTimeoutMs}ms`,
		onRetry,
		beforeAttempt: () => pacer?.takeSlot(),
		run: () =>
			stripeCli.subscriptions.list({
				...params,
				limit: pageSize,
				starting_after: startingAfter,
			}),
	});
};
