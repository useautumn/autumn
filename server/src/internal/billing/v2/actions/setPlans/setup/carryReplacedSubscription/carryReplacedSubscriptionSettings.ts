import type { BillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isBackdateRecreate } from "../../utils/isBackdateRecreate";
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

/** A subscription recreated for a backdate keeps the old one's discounts, payment, collection, tax and metadata. */
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
	if (!isBackdateRecreate({ billingContext })) return {};
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
