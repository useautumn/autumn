import type {
	BillingContext,
	ResolvedCreateSchedulePhaseV0,
} from "@autumn/shared";
import { isBackdateRecreate } from "./isBackdateRecreate";

export const restartsCycleAtBackdatedStart = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	> & {
		immediatePhase?: Pick<
			ResolvedCreateSchedulePhaseV0,
			"billing_cycle_anchor"
		>;
	};
}) =>
	isBackdateRecreate({ billingContext }) &&
	billingContext.immediatePhase?.billing_cycle_anchor === "phase_start";
