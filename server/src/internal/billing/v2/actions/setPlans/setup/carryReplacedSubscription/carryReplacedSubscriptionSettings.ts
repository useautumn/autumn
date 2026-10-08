import type { BillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { carryReplacedSubscriptionDiscounts } from "./carryReplacedSubscriptionDiscounts";
import {
	replacedSubscriptionCreateParams,
	replacedSubscriptionUserMetadata,
} from "./replacedSubscriptionCreateParams";

type CarriedSettings = Partial<
	Pick<
		BillingContext,
		"stripeDiscounts" | "userMetadata" | "carriedSubscriptionParams"
	>
>;

/** Whatever the reason for a recreate, the new subscription keeps the old one's discounts, payment, collection, tax and metadata. */
export const carryReplacedSubscriptionSettings = async ({
	ctx,
	billingContext,
	preview,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	preview: boolean;
}): Promise<CarriedSettings> => {
	const { replacedStripeSubscription } = billingContext;
	if (!replacedStripeSubscription) return {};
	if (billingContext.skipBillingChanges && !preview) return {};

	return {
		stripeDiscounts: await carryReplacedSubscriptionDiscounts({
			ctx,
			stripeDiscounts: billingContext.stripeDiscounts,
			replacedStripeSubscription,
			currentEpochMs: billingContext.currentEpochMs,
			preview,
		}),
		userMetadata: {
			...replacedSubscriptionUserMetadata({ replacedStripeSubscription }),
			...billingContext.userMetadata,
		},
		carriedSubscriptionParams: replacedSubscriptionCreateParams({
			replacedStripeSubscription,
		}),
	};
};
