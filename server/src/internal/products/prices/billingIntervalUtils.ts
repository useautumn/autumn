import { BillingInterval } from "@autumn/shared";
import {
  addMonths,
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
  subYears,
} from "date-fns";
import { UTCDate } from "@date-fns/utc";
import { formatUnixToDate, formatUnixToDateTime } from "@/utils/genUtils.js";

export const subtractBillingIntervalUnix = (
  unixTimestamp: number,
  interval: BillingInterval,
) => {
  const date = new UTCDate(unixTimestamp);
  let subtractedDate = date;
  switch (interval) {
    case BillingInterval.Month:
      subtractedDate = subMonths(date, 1);
      break;
    case BillingInterval.Quarter:
      subtractedDate = subMonths(date, 3);
      break;
    case BillingInterval.SemiAnnual:
      subtractedDate = subMonths(date, 6);
      break;
    case BillingInterval.Year:
      subtractedDate = subYears(date, 1);
      break;
    default:
      throw new Error(`Invalid billing interval: ${interval}`);
  }
  return subtractedDate.getTime();
};

export const addBillingIntervalUnix = (
  unixTimestamp: number,
  interval: BillingInterval,
) => {
  const date = new UTCDate(unixTimestamp);
  let addedDate = date;
  switch (interval) {
    case BillingInterval.Month:
      addedDate = addMonths(date, 1);
      break;
    case BillingInterval.Quarter:
      addedDate = addMonths(date, 3);
      break;
    case BillingInterval.SemiAnnual:
      addedDate = addMonths(date, 6);
      break;
    case BillingInterval.Year:
      addedDate = addYears(date, 1);
      break;
    default:
      throw new Error(`Invalid billing interval: ${interval}`);
  }
  return addedDate.getTime();
};

export const getNextStartOfMonthUnix = (interval: BillingInterval) => {
  const nextBillingCycle = addBillingIntervalUnix(Date.now(), interval);

  // Subtract till it hits first
  const date = new UTCDate(nextBillingCycle);
  const firstDayOfMonth = startOfMonth(date);
  const twelveOClock = setHours(firstDayOfMonth, 12);

  return twelveOClock.getTime();
};

export const getAlignedIntervalUnix = ({
  alignWithUnix,
  interval,
  now,
  alwaysReturn,
}: {
  alignWithUnix: number;
  interval: BillingInterval;
  now?: number;
  alwaysReturn?: boolean;
}) => {
  let nextCycleAnchorUnix = alignWithUnix;

  now = now || Date.now();

  const naturalBillingDate = addBillingIntervalUnix(now, interval);

  // console.log("Now:", formatUnixToDateTime(now));
  // console.log("Anchoring to:", formatUnixToDateTime(alignWithUnix));
  // console.log("Nat billing date:", formatUnixToDateTime(naturalBillingDate));

  const maxIterations = 10000;
  let iterations = 0;
  while (true) {
    const subtractedUnix = subtractBillingIntervalUnix(
      nextCycleAnchorUnix,
      interval,
    );

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

  // console.log("Next cycle anchor:", formatUnixToDateTime(nextCycleAnchorUnix));
  // console.log("--------------------------------");

  if (
    differenceInSeconds(
      new Date(naturalBillingDate),
      new Date(nextCycleAnchorUnix),
    ) < 60
  ) {
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
    0,
  ).getDate();

  // Apply target day (capped to last day of month) and time components
  alignedDate = setDate(alignedDate, Math.min(targetDay, lastDayOfMonth));
  alignedDate = setHours(alignedDate, targetHours);
  alignedDate = setMinutes(alignedDate, targetMinutes);
  alignedDate = setSeconds(alignedDate, targetSeconds);

  return getTime(alignedDate);
};
