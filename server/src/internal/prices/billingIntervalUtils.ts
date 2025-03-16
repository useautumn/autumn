import { BillingInterval } from "@shared/models/productModels/fixedPriceModels.js";
import { TZDate } from "@date-fns/tz";
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

export const subtractBillingIntervalUnix = (
  unixTimestamp: number,
  interval: BillingInterval
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
  interval: BillingInterval
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
  // const date = new Date(nextBillingCycle);
  const firstDayOfMonth = startOfMonth(date);

  // Format first day of month in UTC
  // console.log(format(firstDayOfMonth, "yyyy-MM-dd HH:mm:ss zzz"));

  return firstDayOfMonth.getTime();
};

export const getAlignedIntervalUnix = (
  alignWithUnix: number,
  interval: BillingInterval
) => {
  const nextCycleAnchor = alignWithUnix;
  let nextCycleAnchorUnix = nextCycleAnchor;
  const naturalBillingDate = addBillingIntervalUnix(Date.now(), interval);

  while (true) {
    const subtractedUnix = subtractBillingIntervalUnix(
      nextCycleAnchorUnix,
      interval
    );

    if (subtractedUnix < Date.now()) {
      break;
    }

    nextCycleAnchorUnix = subtractedUnix;
  }

  let billingCycleAnchorUnix: number | undefined = nextCycleAnchorUnix;
  if (
    differenceInSeconds(
      new Date(naturalBillingDate),
      new Date(nextCycleAnchorUnix)
    ) < 60
  ) {
    billingCycleAnchorUnix = undefined;
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

// export const subtractFromUnixTillAligned = ({
//   targetUnix,
//   originalUnix,
// }: {
//   targetUnix: number;
//   originalUnix: number;
// }) => {
//   console.log(
//     "Subtracting from unix till aligned",
//     format(new Date(targetUnix), "dd MMM yyyy HH:mm:ss"),
//     format(new Date(originalUnix), "dd MMM yyyy HH:mm:ss")
//   );

//   // 1. Deduct months till unix is less than now
//   // 1. Get day of unix
//   const targetDate = new Date(targetUnix);
//   const originalDate = new Date(originalUnix);

//   // Get target date components
//   const targetDay = targetDate.getDate();
//   const targetHours = targetDate.getHours();
//   const targetMinutes = targetDate.getMinutes();
//   const targetSeconds = targetDate.getSeconds();

//   // Create new date with original year/month but target day/time
//   const alignedUnix = new Date(originalDate);
//   // Eg jan to feb?

//   const lastDayOfMonth = new Date(
//     alignedUnix.getFullYear(),
//     alignedUnix.getMonth() + 1,
//     0
//   ).getDate();
//   alignedUnix.setDate(Math.min(targetDay, lastDayOfMonth));
//   alignedUnix.setHours(targetHours);
//   alignedUnix.setMinutes(targetMinutes);
//   alignedUnix.setSeconds(targetSeconds);

//   return alignedUnix.getTime();
// };
