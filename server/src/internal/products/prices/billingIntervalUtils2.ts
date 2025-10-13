import type { IntervalConfig } from "@autumn/shared";
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

export const subtractIntervalFromAnchor = ({
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
			unixTimestamp: anchor,
			interval: intervalConfig.interval,
			intervalCount: intervalConfig.intervalCount ?? 1,
		});

		// Return anchor before it goes below now
		if (newAnchor <= now) return curAnchor;

		curAnchor = newAnchor;
	}

	return now;
};

export const getAlignedUnix = ({
	anchor,
	intervalConfig,
	now,
}: {
	anchor: number; // can be in the future or past
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
