import {
	BillingVersion,
	type ExistingRolloversConfig,
	type ExistingUsagesConfig,
	type FullCusProduct,
	type FullCustomer,
	type SyncProductContext,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { stripeSubscriptionToAutumnStatus } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	getCancelFieldsFromStripe,
	getTrialEndsAtFromStripe,
} from "@/internal/billing/v2/actions/sync/utils/initSyncFromStripe";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import { isProductFreeInSyncCurrency } from "../utils/syncContextUtils";

export const initImmediateSyncCustomerProduct = ({
	ctx,
	fullCustomer,
	productContext,
	stripeSubscription,
	currency,
	currentEpochMs,
	existingUsagesConfig,
	existingRolloversConfig,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	productContext: SyncProductContext;
	stripeSubscription: Stripe.Subscription;
	currency: string;
	currentEpochMs: number;
	existingUsagesConfig?: ExistingUsagesConfig;
	existingRolloversConfig?: ExistingRolloversConfig;
}): FullCusProduct => {
	const { fullProduct, featureQuantities, customerLicenseQuantities, entity } =
		productContext;

	if (isProductFreeInSyncCurrency({ fullProduct, currency })) {
		return initFullCustomerProduct({
			ctx,
			initContext: {
				fullCustomer,
				fullProduct,
				featureQuantities,
				customerLicenseQuantities,
				entity,
				resetCycleAnchor: currentEpochMs,
				now: currentEpochMs,
				freeTrial: null,
				trialEndsAt: undefined,
				billingVersion: BillingVersion.V2,
				existingUsagesConfig,
				existingRolloversConfig,
			},
			initOptions: { internalEntityId: entity?.internal_id },
		});
	}

	const trialEndsAt = getTrialEndsAtFromStripe({ stripeSubscription });
	const { canceledAt, endedAt } = getCancelFieldsFromStripe({
		stripeSubscription,
	});
	const resetCycleAnchorMs = secondsToMs(
		stripeSubscription.billing_cycle_anchor,
	);

	return initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			customerLicenseQuantities,
			entity,
			resetCycleAnchor: resetCycleAnchorMs,
			now: currentEpochMs,
			freeTrial: null,
			trialEndsAt,
			billingVersion: BillingVersion.V2,
			existingUsagesConfig,
			existingRolloversConfig,
		},
		initOptions: {
			subscriptionId: stripeSubscription.id,
			canceledAt,
			endedAt,
			startsAt: stripeSubscription.start_date
				? secondsToMs(stripeSubscription.start_date)
				: undefined,
			keepSubscriptionIds: true,
			status: stripeSubscriptionToAutumnStatus({
				stripeStatus: stripeSubscription.status,
			}),
			internalEntityId: entity?.internal_id,
		},
	});
};
