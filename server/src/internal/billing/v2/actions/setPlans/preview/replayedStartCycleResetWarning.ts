import {
	boldText,
	formatMsToDate,
	plainText,
	type SetPlansPreviewWarning,
} from "@autumn/shared";
import { classifyFirstPhaseStart } from "../setup/classifyFirstPhaseStart";
import type { SubscriptionWarningContext } from "./subscriptionStateToWarnings";
import { warningText } from "./warningText";

/** A first phase replaying the live start resets its cycle on that start, which is the anchor it already has. */
export const replayedStartCycleResetWarning = ({
	billingContext,
}: {
	billingContext: SubscriptionWarningContext;
}): Omit<SetPlansPreviewWarning, "severity"> | undefined => {
	const { immediatePhase, stripeSubscription, replacedStripeSubscription } =
		billingContext;
	if (!immediatePhase || !stripeSubscription || replacedStripeSubscription) {
		return undefined;
	}
	if (immediatePhase.billing_cycle_anchor !== "phase_start") return undefined;

	const replaysPastStart =
		classifyFirstPhaseStart({
			startsAt: immediatePhase.starts_at,
			currentEpochMs: billingContext.currentEpochMs,
		}) === "past";
	if (!replaysPastStart) return undefined;

	return {
		type: "cycle_reset_ignored",
		...warningText([
			plainText(
				"Resetting the cycle on the phase start moves nothing: the first phase starts on",
			),
			boldText(formatMsToDate(immediatePhase.starts_at)),
			plainText(
				"when the current cycle started. Start it now to reset the cycle today.",
			),
		]),
	};
};
