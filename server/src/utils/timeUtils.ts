import { Duration, EntInterval } from "@autumn/shared";

import { Entitlement } from "@autumn/shared";
import { add } from "date-fns";
import { UTCDate } from "@date-fns/utc";

// 1. Get next entitlement reset
export const getNextEntitlementReset = (
  prevReset: Date | null,
  interval: EntInterval
) => {
  if (!prevReset) {
    prevReset = new UTCDate();
  }

  switch (interval) {
    case EntInterval.Minute:
      return add(prevReset, { minutes: 1 });
    case EntInterval.Hour:
      return add(prevReset, { hours: 1 });
    case EntInterval.Day:
      return add(prevReset, { days: 1 });
    case EntInterval.Week:
      return add(prevReset, { weeks: 1 });
    case EntInterval.Month:
      return add(prevReset, { months: 1 });
    case EntInterval.Quarter:
      return add(prevReset, { months: 3 });
    case EntInterval.SemiAnnual:
      return add(prevReset, { months: 6 });
    case EntInterval.Year:
      return add(prevReset, { years: 1 });
    default:
      throw new Error("Invalid duration");
  }
};

export const getNextResetAt = (
  curReset: Date | null,
  interval: EntInterval
) => {
  while (true) {
    const nextReset = getNextEntitlementReset(curReset, interval);
    if (nextReset.getTime() > Date.now()) {
      return nextReset.getTime();
    }
    curReset = nextReset;
  }
};
