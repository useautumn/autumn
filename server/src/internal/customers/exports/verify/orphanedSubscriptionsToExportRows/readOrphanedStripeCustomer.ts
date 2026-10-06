import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RatePacer } from "@/utils/createRatePacer.js";
import { retryBoundedAsync } from "@/utils/retryBoundedAsync.js";
import { billingVerifyExportConfig } from "../billingVerifyExportConfig.js";
import {
	isBilledSubscription,
	type OrphanedStripeCustomer,
} from "./orphanToExportRow.js";

const STRIPE_LIST_PAGE_LIMIT = 100;

/** The sweep can be an hour old by now, so the orphan is re-read live and
 * dropped if its customer was deleted or nothing on it is still billed. */
export const readOrphanedStripeCustomer = async ({
	ctx,
	stripeCli,
	stripeCustomerId,
	pacer,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	stripeCustomerId: string;
	pacer: RatePacer;
}): Promise<OrphanedStripeCustomer | null> => {
	const { timeoutMs, attempts, retryDelayMs, maxRetryDelayMs } =
		billingVerifyExportConfig.orphans;

	const listSubscriptions = async () => {
		const subscriptions: Stripe.Subscription[] = [];
		let startingAfter: string | undefined;
		while (true) {
			await pacer.takeSlot();
			const page = await stripeCli.subscriptions.list({
				customer: stripeCustomerId,
				limit: STRIPE_LIST_PAGE_LIMIT,
				starting_after: startingAfter,
			});
			subscriptions.push(...page.data);
			if (!page.has_more) return subscriptions;
			startingAfter = page.data[page.data.length - 1]?.id;
		}
	};

	const readOnce = async () => {
		await pacer.takeSlot();
		const stripeCustomer = await stripeCli.customers.retrieve(stripeCustomerId);
		if (stripeCustomer.deleted) return null;

		const billed = (await listSubscriptions()).filter(isBilledSubscription);
		if (billed.length === 0) return null;

		return {
			stripeCustomerId,
			name: stripeCustomer.name ?? null,
			email: stripeCustomer.email ?? null,
			subscriptionIds: billed.map((subscription) => subscription.id),
		};
	};

	return retryBoundedAsync({
		attempts,
		delayMs: retryDelayMs,
		maxDelayMs: maxRetryDelayMs,
		timeoutMs,
		timeoutMessage: `Stripe customer ${stripeCustomerId} timed out after ${timeoutMs}ms`,
		run: readOnce,
		onRetry: ({ attempt, error }) =>
			ctx.logger.warn("billing-verify-export: retrying orphan read", {
				data: {
					stripeCustomerId,
					attempt,
					error: error instanceof Error ? error.message : String(error),
				},
			}),
	});
};
