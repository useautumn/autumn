import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { StripeSubscriptionAction } from "@/internal/billing/v2/types/billingPlan";

export const shouldCreateManualStripeInvoice = ({
	billingContext,
	stripeSubscriptionAction,
}: {
	billingContext: BillingContext;
	stripeSubscriptionAction?: StripeSubscriptionAction;
}): boolean => {
	const isCreateAction = stripeSubscriptionAction?.type === "create";
	if (isCreateAction) return false;

	const { stripeSubscription, trialContext } = billingContext;
	if (!stripeSubscription) return false;

	const isTrialing = isStripeSubscriptionTrialing(stripeSubscription);
	const endingTrial = trialContext?.trialEndsAt === null;
	const updateWillCharge =
		stripeSubscriptionAction?.type === "update" && isTrialing && endingTrial;

	if (updateWillCharge) return false;

	return true;
};
