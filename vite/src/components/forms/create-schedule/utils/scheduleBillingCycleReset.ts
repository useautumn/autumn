import { type FreeTrial, trialAnchorsBillingCycle } from "@autumn/shared";
import type { CustomerStateForm } from "@/components/forms/customer-state/customerStateSchema";
import type { FreeTrialFormValues } from "@/components/forms/shared/utils/freeTrialFormValues";
import {
	type CurrentScheduleTrial,
	scheduleRequestHasTrial,
} from "./scheduleFreeTrial";
import { firstPhaseStartsLater } from "./schedulePhaseTiming";

/**
 * How the first phase resets its cycle. set_plans rejects any anchor beside the trial it keeps or starts, unless the
 * first phase backdates a trialing subscription; that reset is locked and reads as off, so the request leaves it out.
 */
export const scheduleBillingCycleReset = ({
	formValues,
	nowMs,
	currentTrial,
	catalogFreeTrial,
	backdatesLiveSubscription,
}: {
	formValues: Pick<
		CustomerStateForm,
		"phases" | "resetBillingCycle" | "billingCycleAnchorMode"
	> &
		FreeTrialFormValues;
	nowMs: number;
	currentTrial: CurrentScheduleTrial | null;
	catalogFreeTrial: FreeTrial | null;
	backdatesLiveSubscription: boolean;
}) => {
	const { phases, billingCycleAnchorMode } = formValues;
	const trialAnchorsCycle = trialAnchorsBillingCycle({
		hasTrial: scheduleRequestHasTrial({
			phases,
			nowMs,
			formValues,
			currentTrial,
			catalogFreeTrial,
		}),
		backdatesTrialingSubscription:
			backdatesLiveSubscription && currentTrial !== null,
	});
	const resetBillingCycle = formValues.resetBillingCycle && !trialAnchorsCycle;
	return {
		trialAnchorsBillingCycle: trialAnchorsCycle,
		resetBillingCycle,
		resetsCycleNow:
			resetBillingCycle &&
			billingCycleAnchorMode === "now" &&
			!backdatesLiveSubscription &&
			!firstPhaseStartsLater({ phases, nowMs }),
		usesCustomAnchor: resetBillingCycle && billingCycleAnchorMode === "custom",
	};
};
