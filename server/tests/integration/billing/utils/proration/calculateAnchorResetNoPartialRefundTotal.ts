import { type EntInterval, getCycleEnd, getCycleStart } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { calculateProrationFromPeriod } from "./calculateProration";
import { getBillingPeriod } from "./getBillingPeriod";

const floorToStripeSecond = (timestampMs: number) =>
	Math.floor(timestampMs / 1000) * 1000;

export const calculateAnchorResetNoPartialRefundTotal = async ({
	customerId,
	advancedTo,
	oldAmount,
	newAmount,
	refundCycleInterval,
	refundCycleIntervalCount = 1,
	interval,
}: {
	customerId: string;
	advancedTo: number;
	oldAmount: number;
	newAmount: number;
	refundCycleInterval: EntInterval;
	refundCycleIntervalCount?: number;
	interval?: "month" | "year";
}): Promise<{ total: number; refund: number }> => {
	const { billingPeriod } = await getBillingPeriod({
		customerId,
		interval,
	});

	const now = floorToStripeSecond(advancedTo);

	const cycleStart = getCycleStart({
		anchor: billingPeriod.start,
		interval: refundCycleInterval,
		intervalCount: refundCycleIntervalCount,
		now,
	});

	const snappedNow =
		cycleStart === now
			? now
			: getCycleEnd({
					anchor: billingPeriod.start,
					interval: refundCycleInterval,
					intervalCount: refundCycleIntervalCount,
					now,
				});

	if (snappedNow >= billingPeriod.end) {
		return { total: newAmount, refund: 0 };
	}

	const refund = calculateProrationFromPeriod({
		billingPeriod,
		advancedTo: snappedNow,
		amount: oldAmount,
	});

	const total = new Decimal(newAmount)
		.minus(refund)
		.toDecimalPlaces(2)
		.toNumber();

	return { total, refund };
};
