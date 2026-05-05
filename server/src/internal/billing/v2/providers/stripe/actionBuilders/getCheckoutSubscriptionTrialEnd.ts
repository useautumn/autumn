import type { BillingContext } from "@autumn/shared";
import { msToSeconds } from "@autumn/shared";
import { addMinutes } from "date-fns";

export const getCheckoutSubscriptionTrialEnd = ({
	mode,
	billingContext,
}: {
	mode: "subscription" | "payment";
	billingContext: BillingContext;
}): number | undefined => {
	if (mode !== "subscription") return undefined;
	if (billingContext.billingStartsAt) {
		return msToSeconds(billingContext.billingStartsAt);
	}
	if (!billingContext.trialContext?.trialEndsAt) return undefined;

	return msToSeconds(
		addMinutes(billingContext.trialContext.trialEndsAt, 10).getTime(),
	);
};
