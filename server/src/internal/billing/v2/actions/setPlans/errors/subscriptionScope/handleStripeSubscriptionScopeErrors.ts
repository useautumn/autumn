import type { CreateScheduleBillingContext } from "@autumn/shared";
import { assertNoMainPlanGroupOnAnotherSubscription } from "./assertNoMainPlanGroupOnAnotherSubscription";
import { assertNoRequestedPlanOnAnotherSubscription } from "./assertNoRequestedPlanOnAnotherSubscription";
import { assertTargetSubscriptionCurrency } from "./assertTargetSubscriptionCurrency";
import { assertUntargetedPlansShareOneSubscription } from "./assertUntargetedPlansShareOneSubscription";

export const handleStripeSubscriptionScopeErrors = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	assertUntargetedPlansShareOneSubscription({ billingContext });
	assertNoRequestedPlanOnAnotherSubscription({ billingContext });
	assertNoMainPlanGroupOnAnotherSubscription({ billingContext });
	assertTargetSubscriptionCurrency({ billingContext });
};
