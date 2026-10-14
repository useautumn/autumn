import type { IntervalConfig } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { toMilliseconds } from "../../../utils/timeUtils.js";
import {
	addIntervalForProration,
	subtractIntervalForProration,
} from "./billingIntervalUtils.js";

export const addIntervalToAnchor = ({
	intervalConfig,
	anchorUnix,
	now,
}: {
	intervalConfig: IntervalConfig;
	anchorUnix: number;
	now?: number;
}) => {
	now = now || Date.now();

	let nextInterval = anchorUnix;
	for (let i = 0; i < 50; i++) {
		if (nextInterval > now) return nextInterval;

		nextInterval = addIntervalForProration({
			unixTimestamp: nextInterval,
			intervalConfig,
		});
	}

	return addIntervalForProration({
		unixTimestamp: anchorUnix,
		intervalConfig,
	});
};

const isLessThanEquals = ({ a, b }: { a: UTCDate; b: UTCDate }) => {
	const aUnix = a.getTime();
	const bUnix = b.getTime();
	if (aUnix < bUnix + toMilliseconds.hours(1)) return true;

	return false;
};

const subtractIntervalFromAnchor = ({
	anchor,
	intervalConfig,
	now,
}: {
	anchor: number;
	intervalConfig: IntervalConfig;
	now?: number;
}) => {
	let curAnchor = anchor;
	now = now || Date.now();

	for (let i = 0; i < 50; i++) {
		const newAnchor = subtractIntervalForProration({
			unixTimestamp: curAnchor,
			interval: intervalConfig.interval,
			intervalCount: intervalConfig.intervalCount ?? 1,
		});

		if (isLessThanEquals({ a: new UTCDate(newAnchor), b: new UTCDate(now) }))
			return curAnchor;

		curAnchor = newAnchor;
	}

	return now;
};

export const getPeriodStartForEnd = ({
	anchor,
	intervalConfig,
	targetEnd,
}: {
	anchor: number;
	intervalConfig: IntervalConfig;
	targetEnd: number;
}) => {
	let periodStart = anchor;
	let periodEnd = addIntervalForProration({
		unixTimestamp: anchor,
		intervalConfig,
	});

	const maxIterations = 50;
	let iterations = 0;
	while (periodEnd < targetEnd && iterations < maxIterations) {
		periodStart = periodEnd;
		periodEnd = addIntervalForProration({
			unixTimestamp: periodEnd,
			intervalConfig,
		});
		iterations++;
	}

	return periodStart;
};

export const getAlignedUnix = ({
	anchor,
	intervalConfig,
	now,
}: {
	anchor: number;
	intervalConfig: IntervalConfig;
	now?: number;
}) => {
	now = now || Date.now();

	if (anchor <= now)
		return addIntervalToAnchor({
			intervalConfig,
			anchorUnix: anchor,
			now,
		});

	return subtractIntervalFromAnchor({
		anchor,
		intervalConfig,
		now,
	});
};
