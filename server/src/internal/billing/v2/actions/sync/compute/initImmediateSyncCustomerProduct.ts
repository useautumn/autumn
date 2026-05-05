import {
	BillingVersion,
	type FullCusProduct,
	type FullCustomer,
	secondsToMs,
	type SyncProductContext,
} from "@autumn/shared";
import type Stripe from "stripe";
import { stripeSubscriptionToAutumnStatus } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	getCancelFieldsFromStripe,
	getTrialEndsAtFromStripe,
} from "@/internal/billing/v2/actions/sync/utils/initSyncFromStripe";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

/**
 * Build the immediate-phase cusProduct row for one plan instance, mirroring
 * the legacy `processSyncMapping` flow:
 *   - inherit trial/cancel timestamps from the Stripe subscription
 *   - anchor the reset cycle to the Stripe billing_cycle_anchor
 *   - link the Stripe subscription id
 *   - apply prepaid feature quantities + customize-derived custom prices/ents
 */
export const initImmediateSyncCustomerProduct = ({
	ctx,
	fullCustomer,
	productContext,
	stripeSubscription,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	productContext: SyncProductContext;
	stripeSubscription: Stripe.Subscription;
	currentEpochMs: number;
}): FullCusProduct => {
	const { plan, fullProduct, featureQuantities } = productContext;

	const trialEndsAt = getTrialEndsAtFromStripe({ stripeSubscription });
	const { canceledAt, endedAt } = getCancelFieldsFromStripe({
		stripeSubscription,
	});
	const resetCycleAnchorMs = secondsToMs(stripeSubscription.billing_cycle_anchor);

	return initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			resetCycleAnchor: resetCycleAnchorMs,
			now: currentEpochMs,
			freeTrial: null,
			trialEndsAt,
			billingVersion: BillingVersion.V2,
		},
		initOptions: {
			subscriptionId: stripeSubscription.id,
			isCustom: Boolean(plan.customize),
			canceledAt,
			endedAt,
			startsAt: stripeSubscription.start_date
				? secondsToMs(stripeSubscription.start_date)
				: undefined,
			keepSubscriptionIds: true,
			status: stripeSubscriptionToAutumnStatus({
				stripeStatus: stripeSubscription.status,
			}),
		},
	});
};

