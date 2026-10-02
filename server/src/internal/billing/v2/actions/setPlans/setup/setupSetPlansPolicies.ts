import type {
	CreateScheduleBillingContext,
	SetPlansParamsV0,
} from "@autumn/shared";
import type { SetPlansPolicies } from "../timeline/types/setPlansPolicies";

/**
 * A requested trial starts every plan afresh. A replacement for a canceled, paid-up
 * subscription keeps plans' cycle unless a new paid plan or anchor restarts billing.
 */
const liveRowsPolicy = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}): SetPlansPolicies["liveRows"] => {
	const {
		replacedStripeSubscription,
		requestedBillingCycleAnchor,
		trialContext,
	} = billingContext;
	if (trialContext?.customFreeTrial) return "recreate";
	if (!replacedStripeSubscription) return "carry";

	const continuesPaidUpCycle =
		replacedStripeSubscription.status === "canceled" &&
		requestedBillingCycleAnchor === undefined;
	return continuesPaidUpCycle ? "recreateWhenPaidRecurringStarts" : "recreate";
};

export const setupSetPlansPolicies = ({
	billingContext,
	params,
}: {
	billingContext: CreateScheduleBillingContext;
	params: Pick<SetPlansParamsV0, "undeclared_plans">;
}): SetPlansPolicies => ({
	undeclared: params.undeclared_plans ?? "end",
	canceling: "keepCancellation",
	pastDue: "continue",
	liveRows: liveRowsPolicy({ billingContext }),
});
