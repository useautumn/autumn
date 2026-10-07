import type { BillingContext, FullCusProduct } from "@autumn/shared";
import type { SchedulePhaseProration } from "@/internal/billing/v2/providers/stripe/setup/resolveSchedulePhaseProrations";
import { phaseStartCreditsUnusedTime } from "@/internal/billing/v2/utils/schedulePhaseProration/resolvePhaseStartProrationBehavior";
import { getNextCycleEvent, type NextCycleEvent } from "./getNextCycleEvent";
import { normalizeMs, SECOND_MS } from "./getNextCycleEvent/timeUtils";

/** An anchor reset under proration_behavior none moves the anchor without an invoice, so the search resumes from it. */
export const findNextInvoicedCycleEvent = ({
	billingContext,
	customerProducts,
	anchorMs,
	phaseProrations,
}: {
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	anchorMs: number;
	phaseProrations: SchedulePhaseProration[];
}): { event: NextCycleEvent; anchorMs: number } => {
	const event = getNextCycleEvent({
		billingContext,
		customerProducts,
		anchorMs,
		phaseProrations,
	});
	const resetInvoicesNothing =
		event.kind === "anchor_reset" &&
		!phaseStartCreditsUnusedTime({
			prorationBehavior: event.prorationBehavior,
		});
	if (!resetInvoicesNothing) return { event, anchorMs };

	return {
		event: getNextCycleEvent({
			billingContext,
			customerProducts,
			anchorMs: event.startsAtMs,
			phaseProrations,
			// Candidates are second-precision, so the reset's own second is not after it.
			fromMs: normalizeMs(event.startsAtMs) + SECOND_MS,
		}),
		anchorMs: event.startsAtMs,
	};
};
