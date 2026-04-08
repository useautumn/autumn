/**
 * Calculate total charge for cross-interval switches (e.g., monthly → annual, annual → monthly).
 *
 * Logic:
 * 1. Credit for remaining old period (prorated)
 * 2. Prorated new charge (from now until anchor + newInterval)
 * 3. Total = newCharge - oldCredit
 *
 * Uses Decimal.js for precision.
 */

import { addInterval, BillingInterval } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { getBillingPeriod } from "./getBillingPeriod";

export type CalculateCrossIntervalUpgradeParams = {
	customerId: string;
	advancedTo: number;
	oldAmount?: number;
	newAmount: number;
	oldInterval?: "month" | "year";
	newInterval?: BillingInterval;
};

export const calculateCrossIntervalUpgrade = async ({
	customerId,
	advancedTo,
	oldAmount = 0,
	newAmount,
	oldInterval = "month",
	newInterval = BillingInterval.Year,
}: CalculateCrossIntervalUpgradeParams): Promise<number> => {
	const { billingPeriod, billingAnchorMs } = await getBillingPeriod({
		customerId,
		interval: oldInterval,
	});

	const now = new Decimal(Math.floor(advancedTo / 1000) * 1000);

	const periodStart = new Decimal(billingPeriod.start);
	const periodEnd = new Decimal(billingPeriod.end);

	// 1. Credit for remaining old period
	const oldRemaining = periodEnd.minus(now);
	const oldTotal = periodEnd.minus(periodStart);
	const oldRatio = oldTotal.isZero()
		? new Decimal(0)
		: oldRemaining.div(oldTotal);
	const oldCredit = oldRatio.mul(oldAmount);

	// 2. Prorated new charge (anchor → anchor + newInterval)
	const newPeriodEndMs = addInterval({
		from: billingAnchorMs,
		interval: newInterval,
	});
	const newPeriodEnd = new Decimal(newPeriodEndMs);
	const newTotal = newPeriodEnd.minus(new Decimal(billingAnchorMs));
	const newRemaining = newPeriodEnd.minus(now);
	const newRatio = newTotal.isZero()
		? new Decimal(0)
		: newRemaining.div(newTotal);
	const newCharge = newRatio.mul(newAmount);

	const total = newCharge.minus(oldCredit);

	return total.toDecimalPlaces(2).toNumber();
};
