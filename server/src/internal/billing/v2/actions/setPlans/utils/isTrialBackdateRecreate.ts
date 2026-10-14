import type { BillingContext } from "@autumn/shared";
import { replacementReason } from "./replacementReason";

export const isTrialBackdateRecreate = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
}) => replacementReason({ billingContext }) === "trialBackdate";
