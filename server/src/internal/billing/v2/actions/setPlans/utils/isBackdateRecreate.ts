import type { BillingContext } from "@autumn/shared";
import { replacementReason } from "./replacementReason";

/**
 * A healthy paid subscription is being recreated from a backdated start; it is already paid through its period end.
 * A trialing one paid nothing, so its recreate bills like a new subscription's backdate instead.
 */
export const isBackdateRecreate = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
}) => replacementReason({ billingContext }) === "paidBackdate";
