import {
	addInterval,
	type BillingContext,
	type BillingPeriod,
	type LineItemContext,
	type Price,
} from "@autumn/shared";
import { getBackdatedCycleCountForPrice } from "./countBackdatedPeriods";

/**
 * Bills a gap over the cycles it reaches, counted like attach's backdate catch-up and ending on
 * the gap's end: in full for bill_difference, otherwise pro rata from the gap's start.
 */
export const getBackdateGapLineItemContext = ({
	price,
	billingContext,
	backdateGap,
}: {
	price: Price;
	billingContext: Pick<BillingContext, "requestedProrationBehavior">;
	backdateGap: BillingPeriod;
}): Pick<
	LineItemContext,
	"billingPeriod" | "now" | "effectivePeriod" | "backdate"
> => {
	const cycleCount = getBackdatedCycleCountForPrice({
		price,
		startsAt: backdateGap.start,
		currentEpochMs: backdateGap.end,
	});
	const cyclesStart = addInterval({
		from: backdateGap.end,
		interval: price.config.interval,
		intervalCount: -cycleCount * (price.config.interval_count ?? 1),
	});
	const billsWholeCycles =
		billingContext.requestedProrationBehavior === "bill_difference";

	return {
		billingPeriod: { start: cyclesStart, end: backdateGap.end },
		now: billsWholeCycles ? cyclesStart : backdateGap.start,
		effectivePeriod: backdateGap,
		backdate: { startsAt: backdateGap.start, cycleCount },
	};
};
