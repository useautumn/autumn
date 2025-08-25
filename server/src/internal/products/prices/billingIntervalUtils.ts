import { BillingInterval } from "@autumn/shared";
import {
  addMinutes,
  addMonths,
  addSeconds,
  addWeeks,
  addYears,
  differenceInSeconds,
  getDate,
  getHours,
  getMinutes,
  getSeconds,
  getTime,
  setDate,
  setHours,
  setMinutes,
  setSeconds,
  startOfMonth,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { UTCDate } from "@date-fns/utc";
import { formatUnixToDateTime } from "@/utils/genUtils.js";

export const subtractBillingIntervalUnix = ({
  unixTimestamp,
  interval,
  intervalCount = 1,
}: {
  unixTimestamp: number;
  interval: BillingInterval;
  intervalCount: number;
}) => {
  const date = new UTCDate(unixTimestamp);
  let subtractedDate = date;
  switch (interval) {
    case BillingInterval.Week:
      subtractedDate = subWeeks(date, 1 * intervalCount);
      break;
    case BillingInterval.Month:
      subtractedDate = subMonths(date, 1 * intervalCount);
      break;
    case BillingInterval.Quarter:
      subtractedDate = subMonths(date, 3 * intervalCount);
      break;
    case BillingInterval.SemiAnnual:
      subtractedDate = subMonths(date, 6 * intervalCount);
      break;
    case BillingInterval.Year:
      subtractedDate = subYears(date, 1 * intervalCount);
      break;
    default:
      throw new Error(`Invalid billing interval: ${interval}`);
  }
  return subtractedDate.getTime();
};

export const addBillingIntervalUnix = ({
  unixTimestamp,
  interval,
  intervalCount = 1,
}: {
  unixTimestamp: number;
  interval?: BillingInterval;
  intervalCount?: number;
}) => {
  if (!interval || !intervalCount) {
    return unixTimestamp;
  }

  const date = new UTCDate(unixTimestamp);
  let addedDate = date;
  switch (interval) {
    case BillingInterval.Week:
      addedDate = addWeeks(date, 1 * intervalCount);
      break;
    case BillingInterval.Month:
      addedDate = addMonths(date, intervalCount);
      break;
    case BillingInterval.Quarter:
      addedDate = addMonths(date, 3 * intervalCount);
      break;
    case BillingInterval.SemiAnnual:
      addedDate = addMonths(date, 6 * intervalCount);
      break;
    case BillingInterval.Year:
      addedDate = addYears(date, 1 * intervalCount);
      break;
    default:
      throw new Error(`Invalid billing interval: ${interval}`);
  }
  return addedDate.getTime();
};

export const getNextStartOfMonthUnix = ({
  interval,
  intervalCount,
}: {
  interval: BillingInterval;
  intervalCount: number;
}) => {
  const nextBillingCycle = addBillingIntervalUnix({
    unixTimestamp: Date.now(),
    interval,
    intervalCount,
  });

  // Subtract till it hits first
  const date = new UTCDate(nextBillingCycle);
  const firstDayOfMonth = startOfMonth(date);
  const twelveOClock = setHours(firstDayOfMonth, 12);

  return twelveOClock.getTime();
};

export const getAlignedIntervalUnix = ({
  alignWithUnix,
  interval,
  intervalCount,
  now,
  alwaysReturn,
}: {
  alignWithUnix: number;
  interval: BillingInterval;
  intervalCount: number;
  now?: number;
  alwaysReturn?: boolean;
}) => {
  // alignWithUnix = addSeconds(alignWithUnix, 20).getTime();

  let nextCycleAnchorUnix = alignWithUnix;

  now = now || Date.now();

  const naturalBillingDate = addBillingIntervalUnix({
    unixTimestamp: now,
    interval,
    intervalCount,
  });

  const maxIterations = 10000;
  let iterations = 0;

  const printLogs = false;
  if (printLogs) {
    console.log(
      "Natural billing date:",
      formatUnixToDateTime(naturalBillingDate)
    );
    console.log(
      "Next cycle anchor unix:",
      formatUnixToDateTime(nextCycleAnchorUnix)
    );
  }

  while (true) {
    const subtractedUnix = subtractBillingIntervalUnix({
      unixTimestamp: nextCycleAnchorUnix,
      interval,
      intervalCount,
    });

    if (printLogs) {
      console.log("Subtracted unix:", formatUnixToDateTime(subtractedUnix));
    }

    if (subtractedUnix <= now) {
      break;
    }

    nextCycleAnchorUnix = subtractedUnix;

    iterations++;
    if (iterations > maxIterations) {
      throw new Error("Max iterations reached");
    }
  }

  let billingCycleAnchorUnix: number | undefined = nextCycleAnchorUnix;

  if (printLogs) {
    console.log(
      "Next cycle anchor:",
      formatUnixToDateTime(nextCycleAnchorUnix)
    );
    console.log("Now:", formatUnixToDateTime(now));
    console.log("--------------------------------");
  }

  let anchorAndNaturalDiff = differenceInSeconds(
    naturalBillingDate,
    nextCycleAnchorUnix
  );

  // For insurance, also means you can't set billing cycle anchor to a minute in the future...
  let anchorAndNowDiff = Math.abs(
    differenceInSeconds(now, nextCycleAnchorUnix)
  );

  if (anchorAndNaturalDiff < 60 || anchorAndNowDiff < 20) {
    if (alwaysReturn) {
      return naturalBillingDate;
    } else {
      billingCycleAnchorUnix = undefined;
    }
  }

  return billingCycleAnchorUnix;
};

export const subtractFromUnixTillAligned = ({
  targetUnix,
  originalUnix,
}: {
  targetUnix: number;
  originalUnix: number;
}) => {
  const targetDate = new UTCDate(targetUnix);
  const originalDate = new UTCDate(originalUnix);

  // Get target date components
  const targetDay = getDate(targetDate);
  const targetHours = getHours(targetDate);
  const targetMinutes = getMinutes(targetDate);
  const targetSeconds = getSeconds(targetDate);
  const originalDay = getDate(originalDate);

  // Create aligned date using date-fns functions
  let alignedDate = originalDate;

  // If target day is greater than original day, subtract a month
  if (targetDay > originalDay) {
    alignedDate = subMonths(alignedDate, 1);
  }

  // Calculate last day of the month to handle month length differences
  const lastDayOfMonth = new UTCDate(
    alignedDate.getFullYear(),
    alignedDate.getMonth() + 1,
    0
  ).getDate();

  // Apply target day (capped to last day of month) and time components
  alignedDate = setDate(alignedDate, Math.min(targetDay, lastDayOfMonth));
  alignedDate = setHours(alignedDate, targetHours);
  alignedDate = setMinutes(alignedDate, targetMinutes);
  alignedDate = setSeconds(alignedDate, targetSeconds);

  return getTime(alignedDate);
};
