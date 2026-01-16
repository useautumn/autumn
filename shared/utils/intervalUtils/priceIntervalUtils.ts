import {
	BillingInterval,
	EntInterval,
	type Entitlement,
	type Price,
} from "@autumn/shared";
import { nullish } from "../utils";

type IntervalConfig = {
	interval: BillingInterval;
	intervalCount?: number | null;
};

const entToBillingInterval = (entInterval: EntInterval | null | undefined) => {
	if (entInterval === EntInterval.Lifetime || !entInterval) {
		return BillingInterval.OneOff;
	} else return entInterval as unknown as BillingInterval;
};

const intervalToValue = (
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

export const compareBillingIntervals = ({
	configA,
	configB,
}: {
	configA: IntervalConfig;
	configB: IntervalConfig;
}): number => {
	const a = intervalToValue(configA.interval, configA.intervalCount);
	const b = intervalToValue(configB.interval, configB.intervalCount);

	return b - a;
};

export const getLargestInterval = ({
	prices,
	excludeOneOff = false,
}: {
	prices: Price[];
	excludeOneOff?: boolean;
}) => {
	let sortedPrices = structuredClone(prices);
	sortPricesByInterval(sortedPrices);

	if (excludeOneOff) {
		sortedPrices = sortedPrices.filter(
			(price) => price.config.interval !== BillingInterval.OneOff,
		);
	}

	if (sortedPrices.length === 0) {
		return null;
	}

	return {
		interval: sortedPrices[0].config.interval,
		intervalCount: sortedPrices[0].config.interval_count ?? 1,
	};
};

export const getSmallestInterval = ({
	prices,
	ents,
	excludeOneOff = false,
}: {
	prices: Price[];
	ents?: Entitlement[];
	excludeOneOff?: boolean;
}) => {
	let allPriceIntervals = prices.map((p) => {
		return {
			interval: p.config.interval,
			intervalCount: p.config.interval_count ?? 1,
		};
	});

	if (excludeOneOff) {
		allPriceIntervals = allPriceIntervals.filter(
			(p) => p.interval !== BillingInterval.OneOff,
		);
	}

	const allEntIntervals = ents?.map((e) => {
		return {
			interval: entToBillingInterval(e.interval),
			intervalCount: e.interval_count ?? 1,
		};
	});

	const allIntervals = [...allPriceIntervals, ...(allEntIntervals || [])];

	if (allIntervals.length === 0) {
		return null;
	}

	allIntervals.sort((a, b) => {
		return compareBillingIntervals({ configA: a, configB: b });
	});

	const smallestInterval = allIntervals?.[allIntervals.length - 1];

	return {
		interval: smallestInterval.interval,
		intervalCount: smallestInterval.intervalCount,
	};
};

export const sortPricesByInterval = (prices: Price[]) => {
	return prices.sort((a, b) => {
		return compareBillingIntervals({ configA: a.config, configB: b.config });
	});
};

export const intervalsDifferent = ({
	intervalA,
	intervalB,
}: {
	intervalA: IntervalConfig | null;
	intervalB: IntervalConfig | null;
}) => {
	// return compareBillingIntervals({ configA: intervalA, configB: intervalB }) !== 0;
	if (nullish(intervalA) && nullish(intervalB)) {
		return false;
	}

	if (nullish(intervalA) || nullish(intervalB)) {
		return true;
	}

	const intervalCountA = intervalToValue(
		intervalA.interval,
		intervalA.intervalCount,
	);
	const intervalCountB = intervalToValue(
		intervalB.interval,
		intervalB.intervalCount,
	);
	return intervalCountA !== intervalCountB;
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
