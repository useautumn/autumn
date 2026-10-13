import type {
	CreateScheduleBillingContext,
	SetPlansParamsV0,
} from "@autumn/shared";
import type { SetPlansPolicies } from "../timeline/types/setPlansPolicies";
import { isBackdateRecreate } from "../utils/isBackdateRecreate";
import { replacementCarriesKeptPlans } from "../utils/replacementCarriesKeptPlans";
import { restartsCycleAtBackdatedStart } from "../utils/restartsCycleAtBackdatedStart";
import { firstPhaseStartsInFuture } from "./classifyFirstPhaseStart";

/**
 * Live rows carry, with a requested trial patched onto them, unless the cycle resets now. A replacement that carries kept
 * plans to a date keeps them unless a new paid plan restarts billing; a backdate keeps them unless it restarts the cycle.
 */
const liveRowsPolicy = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}): SetPlansPolicies["liveRows"] => {
	const { replacedStripeSubscription, requestedBillingCycleAnchor } =
		billingContext;
	// Resetting the cycle now restarts every renewing plan's period, so kept plans are re-billed like changed ones.
	if (requestedBillingCycleAnchor === "now") return "recreateRenewing";
	if (!replacedStripeSubscription) return "carry";
	if (isBackdateRecreate({ billingContext })) {
		return restartsCycleAtBackdatedStart({ billingContext })
			? "recreate"
			: "carry";
	}

	return replacementCarriesKeptPlans({ billingContext })
		? "recreateWhenPaidRecurringStarts"
		: "recreate";
};

export const setupSetPlansPolicies = ({
	billingContext,
	params,
}: {
	billingContext: CreateScheduleBillingContext;
	params: Pick<SetPlansParamsV0, "undeclared_plans">;
}): SetPlansPolicies => ({
	// A later start ends the live plans now, so none is left to retain.
	undeclared: firstPhaseStartsInFuture({ billingContext })
		? "end"
		: (params.undeclared_plans ?? "end"),
	canceling: "keepCancellation",
	pastDue: "continue",
	liveRows: liveRowsPolicy({ billingContext }),
	unbilledRows: billingContext.skipBillingChanges ? "carry" : "recreate",
});
