import { Decimal } from "decimal.js";
import { EntInterval } from "../models/productModels/entModels/entEnums.js";
import { BillingInterval } from "../models/productModels/priceModels/priceEnums.js";

export const intervalToValue = (
	interval: BillingInterval,
	intervalCount?: number | null,
) => {
	const intervalToBaseVal: Record<BillingInterval, number> = {
		[BillingInterval.OneOff]: 0,
		[BillingInterval.Week]: 0.25,
		[BillingInterval.Month]: 1,
		[BillingInterval.Quarter]: 3,
		[BillingInterval.SemiAnnual]: 6,
		[BillingInterval.Year]: 12,
	};

	return intervalToBaseVal[interval] * (intervalCount ?? 1);
};

export type IntervalConfig = {
	interval: BillingInterval;
	intervalCount?: number | null;
};

export const intervalsDifferent = ({
	intervalA,
	intervalB,
}: {
	intervalA: IntervalConfig;
	intervalB: IntervalConfig;
}) => {
	let valA = intervalToValue(intervalA.interval, intervalA.intervalCount);
	let valB = intervalToValue(intervalB.interval, intervalB.intervalCount);
	return valA != valB;
};

export const intervalsSame = ({
	intervalA,
	intervalB,
}: {
	intervalA: IntervalConfig;
	intervalB: IntervalConfig;
}) => {
	return !intervalsDifferent({ intervalA, intervalB });
};

type EntIntervalConfig = {
	interval: EntInterval;
	intervalCount?: number | null;
};

export const entIntervalToValue = (
	interval?: EntInterval | null,
	intervalCount?: number | null,
) => {
	if (!interval) {
		return new Decimal(10000000);
	}

	const intervalToBaseVal: Record<EntInterval, number> = {
		[EntInterval.Minute]: 1,
		[EntInterval.Hour]: 60,
		[EntInterval.Day]: 1 * 60 * 24,
		[EntInterval.Week]: 1 * 60 * 24 * 7,
		[EntInterval.Month]: 1 * 60 * 24 * 30,
		[EntInterval.Quarter]: 1 * 60 * 24 * 90,
		[EntInterval.SemiAnnual]: 1 * 60 * 24 * 180,
		[EntInterval.Year]: 1 * 60 * 24 * 365,
		[EntInterval.Lifetime]: 1000000000,
	};

	const baseValue = intervalToBaseVal[interval];
	return new Decimal(baseValue).mul(intervalCount ?? 1);
};

export const entIntervalsSame = ({
	intervalA,
	intervalB,
}: {
	intervalA: EntIntervalConfig;
	intervalB: EntIntervalConfig;
}) => {
	const valA = entIntervalToValue(intervalA.interval, intervalA.intervalCount);
	const valB = entIntervalToValue(intervalB.interval, intervalB.intervalCount);
	return valA.eq(valB);
};

export const entIntervalsDifferent = ({
	intervalA,
	intervalB,
}: {
	intervalA: EntIntervalConfig;
	intervalB: EntIntervalConfig;
}) => {
	return !entIntervalsSame({ intervalA, intervalB });
};
