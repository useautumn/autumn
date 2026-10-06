import {
	getCycleEnd,
	isOneOffPrice,
	type LineItem,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

export type AnchorResetProration = {
	originalAnchorMs: number;
	currentEpochMs: number;
};

/** Stripe resets each item at a mid-period anchor on its own interval, so a full-cycle
 * line pays only the window its new cycle runs past its own old period end. */
export const prorateAnchorResetLineItem = ({
	lineItem,
	anchorResetProration,
}: {
	lineItem: LineItem;
	anchorResetProration: AnchorResetProration;
}): LineItem => {
	const { price, billingPeriod } = lineItem.context;
	if (!billingPeriod || isOneOffPrice(price)) return lineItem;

	const originalPeriodEnd = getCycleEnd({
		anchor: anchorResetProration.originalAnchorMs,
		interval: price.config.interval,
		intervalCount: price.config.interval_count ?? 1,
		now: anchorResetProration.currentEpochMs,
	});
	const newCycleStart = truncateMsToSecondPrecision(billingPeriod.start);
	const newCycleEnd = truncateMsToSecondPrecision(billingPeriod.end);
	const fullNewCycle = new Decimal(newCycleEnd).minus(newCycleStart);
	if (fullNewCycle.isZero()) return lineItem;

	const extraWindowRatio = new Decimal(newCycleEnd)
		.minus(truncateMsToSecondPrecision(originalPeriodEnd))
		.div(fullNewCycle);
	const prorate = (amount: number) => extraWindowRatio.mul(amount).toNumber();

	return {
		...lineItem,
		amount: prorate(lineItem.amount),
		amountAfterDiscounts: prorate(lineItem.amountAfterDiscounts),
	};
};
