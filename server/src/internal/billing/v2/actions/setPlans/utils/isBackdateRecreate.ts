import type { BillingContext } from "@autumn/shared";
import { replacementReason } from "./replacementReason";

export const isBackdateRecreate = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
}) => replacementReason({ billingContext }) === "paidBackdate";
