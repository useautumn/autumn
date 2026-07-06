import type { CusProductStatus } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { stripeSubscriptionToAutumnStatus } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	getCancelFieldsFromStripe,
	getTrialEndsAtFromStripe,
} from "../../../sync/utils/initSyncFromStripe";
import type { FlashPlanContext } from "../setupFlashContext";

export type StripeHydration = {
	status?: CusProductStatus;
	canceledAt?: number;
	endedAt?: number;
	trialEndsAt?: number;
	periodEndMs?: number;
	startsAt?: number;
};

const secondsToMs = (seconds: number) => seconds * 1000;

const buildHydration = (
	stripeSubscription: Stripe.Subscription,
): StripeHydration => {
	const { canceledAt, endedAt } = getCancelFieldsFromStripe({
		stripeSubscription,
	});
	return {
		status: stripeSubscriptionToAutumnStatus({
			stripeStatus: stripeSubscription.status,
		}),
		canceledAt,
		endedAt,
		trialEndsAt: getTrialEndsAtFromStripe({ stripeSubscription }),
		periodEndMs: secondsToMs(getLatestPeriodEnd({ sub: stripeSubscription })),
		// The imported plan starts when the Stripe sub started, not at import time.
		startsAt: secondsToMs(stripeSubscription.start_date),
	};
};

/**
 * Read-only Stripe hydration: for each Stripe billable with a linked
 * subscription, retrieve it ONCE (`.retrieve` only — flash never writes to
 * Stripe) and stash fields the caller may have omitted. Payload still wins;
 * these only fill gaps in the resolvers. An unretrievable sub is skipped so
 * the flash falls back to caller-supplied values.
 */
export const hydrateStripeBillables = async ({
	ctx,
	planContexts,
}: {
	ctx: AutumnContext;
	planContexts: FlashPlanContext[];
}): Promise<void> => {
	const stripePlanContexts = planContexts.filter(
		(planContext) =>
			planContext.processor === "stripe" && planContext.subscriptionIds[0],
	);
	if (stripePlanContexts.length === 0) return;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const hydrationBySubscription = new Map<string, StripeHydration | null>();

	for (const planContext of stripePlanContexts) {
		const subscriptionId = planContext.subscriptionIds[0];

		if (!hydrationBySubscription.has(subscriptionId)) {
			try {
				const stripeSubscription =
					await stripeCli.subscriptions.retrieve(subscriptionId);
				hydrationBySubscription.set(
					subscriptionId,
					buildHydration(stripeSubscription),
				);
			} catch (error) {
				ctx.logger.warn(
					`dfu.flash: could not retrieve Stripe subscription ${subscriptionId} for hydration; using caller-supplied fields`,
					{ error },
				);
				hydrationBySubscription.set(subscriptionId, null);
			}
		}

		const hydration = hydrationBySubscription.get(subscriptionId);
		if (hydration) planContext.stripeHydration = hydration;
	}
};
