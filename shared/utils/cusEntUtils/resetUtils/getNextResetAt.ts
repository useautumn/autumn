import { UTCDate } from "@date-fns/utc";
import { add } from "date-fns";
import { EntInterval } from "../../../models/productModels/intervals/entitlementInterval.js";

export const getNextEntitlementReset = (
	prevReset: UTCDate | null,
	interval: EntInterval,
	intervalCount: number,
) => {
	if (!prevReset) {
		prevReset = new UTCDate();
	}

	switch (interval) {
		case EntInterval.Minute:
			return add(prevReset, { minutes: intervalCount });
		case EntInterval.Hour:
			return add(prevReset, { hours: intervalCount });
		case EntInterval.Day:
			return add(prevReset, { days: intervalCount });
		case EntInterval.Week:
			return add(prevReset, { weeks: intervalCount });
		case EntInterval.Month:
			return add(prevReset, { months: intervalCount });
		case EntInterval.Quarter:
			return add(prevReset, { months: intervalCount * 3 });
		case EntInterval.SemiAnnual:
			return add(prevReset, { months: intervalCount * 6 });
		case EntInterval.Year:
			return add(prevReset, { years: intervalCount });
		default:
			throw new Error("Invalid duration");
	}
};

/** The first boundary after `now`, stepping one interval at a time from `curReset` (or from now when null). */
export const getNextResetAt = ({
	curReset,
	interval,
	intervalCount = 1,
	now,
}: {
	curReset: number | null;
	interval: EntInterval;
	intervalCount?: number;
	now: number;
}): number => {
	let prevReset = curReset === null ? null : new UTCDate(curReset);
	while (true) {
		const nextReset = getNextEntitlementReset(
			prevReset,
			interval,
			intervalCount || 1,
		);

		if (nextReset.getTime() > now) {
			return nextReset.getTime();
		}
		prevReset = nextReset;
	}
};
