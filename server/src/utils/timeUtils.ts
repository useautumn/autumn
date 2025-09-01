import { EntInterval } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { add } from "date-fns";

// 1. Get next entitlement reset
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

export const getNextResetAt = ({
	curReset,
	interval,
	intervalCount = 1,
}: {
	curReset: UTCDate | null;
	interval: EntInterval;
	intervalCount?: number;
}) => {
	while (true) {
		const nextReset = getNextEntitlementReset(
			curReset,
			interval,
			intervalCount || 1,
		);

		if (nextReset.getTime() > Date.now()) {
			return nextReset.getTime();
		}
		curReset = nextReset;
	}
};
