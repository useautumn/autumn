import {
	addInterval,
	type BillingContext,
	type BillingPeriod,
	type LineItemContext,
	type Price,
} from "@autumn/shared";

const cyclesBeforeEnd = ({
	price,
	end,
	cycleCount,
}: {
	price: Price;
	end: number;
	cycleCount: number;
}) =>
	addInterval({
		from: end,
		interval: price.config.interval,
		intervalCount: -cycleCount * (price.config.interval_count ?? 1),
	});

/** Cycles are counted back from the gap's end, the anchor its billing period is built on, until one reaches its start. */
const countGapCycles = ({
	price,
	backdateGap,
}: {
	price: Price;
	backdateGap: BillingPeriod;
}) => {
	let cycleCount = 1;
	while (
		cyclesBeforeEnd({ price, end: backdateGap.end, cycleCount }) >
		backdateGap.start
	) {
		cycleCount += 1;
	}
	return cycleCount;
};

/**
 * Bills a gap over the cycles it reaches, counted back from the gap's end: in full for
 * bill_difference, otherwise pro rata from the gap's start.
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
	const cycleCount = countGapCycles({ price, backdateGap });
	const cyclesStart = cyclesBeforeEnd({
		price,
		end: backdateGap.end,
		cycleCount,
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
