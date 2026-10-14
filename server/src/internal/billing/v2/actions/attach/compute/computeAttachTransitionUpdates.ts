import type {
	AttachBillingContext,
	AttachParamsV1,
	AutumnBillingPlan,
} from "@autumn/shared";
import { CusProductStatus, isFutureStartDate } from "@autumn/shared";
import { isRevertTrialContext } from "@/internal/billing/v2/setup/trialContext/isRevertTrialContext";

export const computeAttachTransitionUpdates = ({
	attachBillingContext,
	params = {} as AttachParamsV1,
}: {
	attachBillingContext: AttachBillingContext;
	params?: AttachParamsV1;
}): AutumnBillingPlan["updateCustomerProduct"] => {
	const {
		currentCustomerProduct,
		planTiming,
		currentEpochMs,
		endOfCycleMs,
		trialContext,
	} = attachBillingContext;
	const shouldClearBillingCycleReset =
		attachBillingContext.requestedBillingCycleAnchor !== undefined;

	if (!currentCustomerProduct) return undefined;

	if (isRevertTrialContext({ trialContext }) && planTiming === "immediate") {
		return {
			customerProduct: currentCustomerProduct,
			updates: {
				status: CusProductStatus.Paused,
			},
		};
	}

	if (planTiming === "immediate") {
		return {
			customerProduct: currentCustomerProduct,
			updates: {
				billing_cycle_anchor_resets_at: shouldClearBillingCycleReset
					? null
					: undefined,
				status: CusProductStatus.Expired,
				ended_at: currentEpochMs,
				canceled: true,
				canceled_at: currentEpochMs,
			},
		};
	}

	const startsAt = params.starts_at;
	const transitionAtMs = isFutureStartDate(startsAt, currentEpochMs)
		? startsAt
		: endOfCycleMs;

	return {
		customerProduct: currentCustomerProduct,
		updates: {
			billing_cycle_anchor_resets_at: shouldClearBillingCycleReset
				? null
				: undefined,
			canceled: true,
			canceled_at: currentEpochMs,
			ended_at: transitionAtMs,
		},
	};
};
