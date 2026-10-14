import {
	addInterval,
	type BillingContext,
	type BillingPeriod,
	type LineItemContext,
	type Price,
} from "@autumn/shared";

export type BackdateGapRun = {
	gap: BillingPeriod;
	run: BillingPeriod;
};

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

const cyclesBackToStartAt = ({
	price,
	gap,
	at,
}: {
	price: Price;
	gap: BillingPeriod;
	at: number;
}) => {
	let cycleCount = 1;
	while (cyclesBeforeEnd({ price, end: gap.end, cycleCount }) > at) {
		cycleCount += 1;
	}
	return cycleCount;
};

const cyclesAfterRun = ({
	price,
	gap,
	run,
}: {
	price: Price;
	gap: BillingPeriod;
	run: BillingPeriod;
}) => {
	let cycleCount = 0;
	while (
		cyclesBeforeEnd({ price, end: gap.end, cycleCount: cycleCount + 1 }) >=
		run.end
	) {
		cycleCount += 1;
	}
	return cycleCount;
};

export const getBackdateGapLineItemContext = ({
	price,
	billingContext,
	backdateGapRun,
}: {
	price: Price;
	billingContext: Pick<BillingContext, "requestedProrationBehavior">;
	backdateGapRun: BackdateGapRun;
}): Pick<LineItemContext, "now"> &
	Required<
		Pick<LineItemContext, "billingPeriod" | "effectivePeriod" | "backdate">
	> => {
	const { gap, run } = backdateGapRun;
	const cyclesToRunStart = cyclesBackToStartAt({ price, gap, at: run.start });
	const skippedCycles = cyclesAfterRun({ price, gap, run });
	const billingPeriod = {
		start: cyclesBeforeEnd({
			price,
			end: gap.end,
			cycleCount: cyclesToRunStart,
		}),
		end: cyclesBeforeEnd({ price, end: gap.end, cycleCount: skippedCycles }),
	};
	const billsWholeCycles =
		billingContext.requestedProrationBehavior === "bill_difference";
	const runProrationNow = billingPeriod.end - (run.end - run.start);

	return {
		billingPeriod,
		now: billsWholeCycles ? billingPeriod.start : runProrationNow,
		effectivePeriod: run,
		backdate: {
			startsAt: run.start,
			cycleCount: cyclesToRunStart - skippedCycles,
		},
	};
};
