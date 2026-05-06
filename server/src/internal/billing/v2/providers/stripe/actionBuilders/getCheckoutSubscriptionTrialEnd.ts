import type { BillingContext } from "@autumn/shared";
import { msToSeconds } from "@autumn/shared";
import { addMinutes } from "date-fns";

export const getCheckoutSubscriptionTrialEnd = ({
	mode,
	billingContext,
	deferredStartsAt,
}: {
	mode: "subscription" | "payment";
	billingContext: BillingContext;
	deferredStartsAt?: number;
}): number | undefined => {
	if (mode !== "subscription") return undefined;
	if (deferredStartsAt) return msToSeconds(deferredStartsAt);
	if (!billingContext.trialContext?.trialEndsAt) return undefined;

	return msToSeconds(
		addMinutes(billingContext.trialContext.trialEndsAt, 10).getTime(),
	);
};
