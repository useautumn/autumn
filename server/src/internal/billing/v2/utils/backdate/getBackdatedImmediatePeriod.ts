import {
	type BillingContext,
	type BillingPeriod,
	getCycleEnd,
	getCycleStart,
	isOneOffPrice,
	type Price,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

/**
 * The period the first invoice of a backdated subscription covers: from the
 * backdated start to the upcoming cycle boundary (e.g. Apr 1 -> Jun 1 on May 29),
 * plus how many in-advance cycles that span charges. Like Stripe, a stub before
 * the anchor's first boundary counts as its prorated fraction of a cycle.
 */
export const getBackdatedImmediatePeriod = ({
	price,
	billingContext,
}: {
	price: Price;
	billingContext: BillingContext;
}): (BillingPeriod & { cycleCount: number }) | undefined => {
	const { subscriptionBackdateStartMs, currentEpochMs, billingCycleAnchorMs } =
		billingContext;

	if (subscriptionBackdateStartMs === undefined) return undefined;
	if (isOneOffPrice(price)) return undefined;

	const anchor =
		typeof billingCycleAnchorMs === "number"
			? billingCycleAnchorMs
			: subscriptionBackdateStartMs;
	const cycle = {
		anchor,
		interval: price.config.interval,
		intervalCount: price.config.interval_count ?? 1,
	};

	const firstCycleStart = getCycleStart({
		...cycle,
		now: subscriptionBackdateStartMs,
	});
	const firstCycleEnd = getCycleEnd({
		...cycle,
		now: subscriptionBackdateStartMs,
	});
	const firstCycleFraction = new Decimal(
		firstCycleEnd - subscriptionBackdateStartMs,
	).div(firstCycleEnd - firstCycleStart);
	let fullCycles = 0;
	for (
		let cycleStart = firstCycleEnd;
		cycleStart <= currentEpochMs;
		cycleStart = getCycleEnd({ ...cycle, now: cycleStart })
	) {
		fullCycles += 1;
	}

	const end = getCycleEnd({
		...cycle,
		now: currentEpochMs,
		floor: anchor,
	});

	return {
		start: subscriptionBackdateStartMs,
		end,
		cycleCount: firstCycleFraction.plus(fullCycles).toNumber(),
	};
};
