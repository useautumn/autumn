import type { BillingContext } from "@autumn/shared";
import { replacementReason } from "./replacementReason";

/** A trialing subscription is being recreated from a backdated start, keeping its trial or ending it per the request. */
export const isTrialBackdateRecreate = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
}) => replacementReason({ billingContext }) === "trialBackdate";
