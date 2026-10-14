import type {
	CreateScheduleBillingContext,
	SetPlansParamsV0,
} from "@autumn/shared";
import { firstPhaseStartsInFuture } from "./classifyFirstPhaseStart";

type FutureStartTiming = Partial<
	Pick<CreateScheduleBillingContext, "resetCycleAnchorMs" | "accessStartsAt">
>;

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
