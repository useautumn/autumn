import type { CreateScheduleBillingContext } from "@autumn/shared";
import { assertNoMainPlanGroupOnAnotherSubscription } from "./assertNoMainPlanGroupOnAnotherSubscription";
import { assertNoRequestedPlanOnAnotherSubscription } from "./assertNoRequestedPlanOnAnotherSubscription";
import { assertTargetSubscriptionCurrency } from "./assertTargetSubscriptionCurrency";

export const handleStripeSubscriptionScopeErrors = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	assertNoRequestedPlanOnAnotherSubscription({ billingContext });
	assertNoMainPlanGroupOnAnotherSubscription({ billingContext });
	assertTargetSubscriptionCurrency({ billingContext });
};
