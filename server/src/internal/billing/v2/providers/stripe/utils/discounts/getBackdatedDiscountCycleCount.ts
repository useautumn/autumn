import {
	addInterval,
	BillingInterval,
	type LineItem,
} from "@autumn/shared";
import type Stripe from "stripe";

export const getBackdatedDiscountCycleCount = ({
	lineItem,
	coupon,
}: {
	lineItem: LineItem;
	coupon: Stripe.Coupon;
}): number => {
	const backdate = lineItem.context.backdate;
	if (!backdate) return 1;

	const { startsAt, cycleCount } = backdate;
	if (coupon.duration === "forever") return cycleCount;
	if (coupon.duration === "once") return 1;

	if (coupon.duration !== "repeating") return 1;

	const durationInMonths = coupon.duration_in_months ?? 0;
	if (durationInMonths <= 0) return 0;

	const discountEndsAt = addInterval({
		from: startsAt,
		interval: BillingInterval.Month,
		intervalCount: durationInMonths,
	});

	let eligibleCycles = 0;
	let cycleStart = startsAt;

	while (eligibleCycles < cycleCount && cycleStart < discountEndsAt) {
		eligibleCycles += 1;
		const nextCycleStart = addInterval({
			from: cycleStart,
			interval: lineItem.context.price.config.interval,
			intervalCount: lineItem.context.price.config.interval_count ?? 1,
		});
		if (nextCycleStart <= cycleStart) break;
		cycleStart = nextCycleStart;
	}

	return Math.min(eligibleCycles, cycleCount);
};
