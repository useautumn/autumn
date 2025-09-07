import { Duration, EntInterval } from "@autumn/shared";

import { Entitlement } from "@autumn/shared";
import { add } from "date-fns";
import { UTCDate } from "@date-fns/utc";
import { formatUnixToDate } from "./genUtils.js";

// Time conversion constants
export const TIME_MS = {
  SECOND: 1000,
  MINUTE: 1000 * 60,
  HOUR: 1000 * 60 * 60,
  DAY: 1000 * 60 * 60 * 24,
  WEEK: 1000 * 60 * 60 * 24 * 7,
} as const;

// Time conversion utility functions
export const toMilliseconds = {
  seconds: (n: number) => n * TIME_MS.SECOND,
  minutes: (n: number) => n * TIME_MS.MINUTE,
  hours: (n: number) => n * TIME_MS.HOUR,
  days: (n: number) => n * TIME_MS.DAY,
  weeks: (n: number) => n * TIME_MS.WEEK,
} as const;

// 1. Get next entitlement reset
export const getNextEntitlementReset = (
  prevReset: UTCDate | null,
  interval: EntInterval,
  intervalCount: number
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
      intervalCount || 1
    );

    if (nextReset.getTime() > Date.now()) {
      return nextReset.getTime();
    }
    curReset = nextReset;
  }
};
