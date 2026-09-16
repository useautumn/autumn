import {
	addInterval,
	applyProration,
	ErrCode,
	isOneOffPrice,
	type Price,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { countBackdatedPeriodsForPrice } from "@/internal/billing/v2/utils/backdate/countBackdatedPeriods";

export type InvoicePeriod = { start: number; end: number };

/**
 * Charges `amount` for `period` measured against the price's own interval:
 * every whole interval from `period.start` bills in full, and the final partial
 * interval is prorated by the fraction of it the period covers.
 */
export const prorateInvoiceLineAmount = ({
	price,
	amount,
	period,
}: {
	price: Price;
	amount: number;
	period?: InvoicePeriod;
}): number => {
	if (!period) return amount;
	if (isOneOffPrice(price)) return amount;

	if (period.end <= period.start) {
		throw new RecaseError({
			message: "period_end must be after period_start",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const interval = price.config.interval;
	const intervalCount = price.config.interval_count ?? 1;

	// Whole intervals strictly before the one containing period.end.
	const cyclesTouched = countBackdatedPeriodsForPrice({
		price,
		startsAt: period.start,
		currentEpochMs: period.end,
	});
	const wholeCycles = cyclesTouched - 1;

	const lastCycleStart = addInterval({
		from: period.start,
		interval,
		intervalCount: intervalCount * wholeCycles,
	});
	const lastCycleEnd = addInterval({
		from: lastCycleStart,
		interval,
		intervalCount,
	});

	const wholeAmount = new Decimal(amount).mul(wholeCycles);
	const partialAmount =
		period.end >= lastCycleEnd
			? new Decimal(amount)
			: new Decimal(amount).minus(
					applyProration({
						now: period.end,
						billingPeriod: { start: lastCycleStart, end: lastCycleEnd },
						amount,
					}),
				);

	return wholeAmount.plus(partialAmount).toDP(2).toNumber();
};
