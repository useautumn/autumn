import type {
	CreateScheduleBillingContext,
	SetPlansParamsV0,
} from "@autumn/shared";
import { firstPhaseStartsInFuture } from "./classifyFirstPhaseStart";

type FutureStartTiming = Partial<
	Pick<CreateScheduleBillingContext, "resetCycleAnchorMs" | "accessStartsAt">
>;

/** A later first phase anchors billing on its start; early access opens its plans now. */
export const setupFutureStartTiming = ({
	billingContext,
	params,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		"immediatePhase" | "currentEpochMs"
	>;
	params: Pick<SetPlansParamsV0, "enable_plan_immediately">;
}): FutureStartTiming => {
	if (!firstPhaseStartsInFuture({ billingContext })) return {};

	return {
		resetCycleAnchorMs: billingContext.immediatePhase.starts_at,
		accessStartsAt: params.enable_plan_immediately
			? billingContext.currentEpochMs
			: undefined,
	};
};
