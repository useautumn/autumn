import {
	type BillingContext,
	type BillingPeriod,
	getCycleEnd,
	isOneOffPrice,
	type Price,
} from "@autumn/shared";
import { getBackdatedCycleCountForPrice } from "./countBackdatedPeriods";

/**
 * The period the first invoice of a backdated subscription covers: from the
 * backdated start to the upcoming cycle boundary (e.g. Apr 1 -> Jun 1 on May 29),
 * plus how many in-advance cycles that span charges.
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

	const cycleCount = getBackdatedCycleCountForPrice({
		price,
		startsAt: subscriptionBackdateStartMs,
		currentEpochMs,
	});

	const anchor =
		typeof billingCycleAnchorMs === "number"
			? billingCycleAnchorMs
			: subscriptionBackdateStartMs;

	const end = getCycleEnd({
		anchor,
		interval: price.config.interval,
		intervalCount: price.config.interval_count ?? 1,
		now: currentEpochMs,
		floor: anchor,
	});

	return { start: subscriptionBackdateStartMs, end, cycleCount };
};
