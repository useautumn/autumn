import {
  BillingInterval,
  EntInterval,
  Entitlement,
  Price,
} from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";

const BillingIntervalOrder = [
  BillingInterval.Year,
  BillingInterval.SemiAnnual,
  BillingInterval.Quarter,
  BillingInterval.Month,
  BillingInterval.OneOff,
];

const ReversedBillingIntervalOrder = [
  // BillingInterval.OneOff,
  BillingInterval.Month,
  BillingInterval.Quarter,
  BillingInterval.SemiAnnual,
  BillingInterval.Year,
];

const entToBillingInterval = (entInterval: EntInterval | null | undefined) => {
  if (entInterval == EntInterval.Lifetime || !entInterval) {
    return BillingInterval.OneOff;
  } else return entInterval as unknown as BillingInterval;
};

export function compareBillingIntervals(
  a: BillingInterval | undefined,
  b: BillingInterval | undefined,
): number {
  if (nullish(a)) {
    return 1;
  } else if (nullish(b)) {
    return -1;
  }

  return BillingIntervalOrder.indexOf(a!) - BillingIntervalOrder.indexOf(b!);
}

export const getFirstInterval = ({
  prices,
  excludeOneOff = false,
}: {
  prices: Price[];
  excludeOneOff?: boolean;
}) => {
  return BillingIntervalOrder.find((interval) =>
    prices.some((price) => {
      let intervalMatch = price.config.interval === interval;
      let oneOffMatch = excludeOneOff
        ? price.config.interval !== BillingInterval.OneOff
        : true;
      return intervalMatch && oneOffMatch;
    }),
  )!;
};

export const getLastInterval = ({
  prices,
  ents,
}: {
  prices: Price[];
  ents?: Entitlement[];
}) => {
  return ReversedBillingIntervalOrder.find(
    (interval) =>
      prices.some((price) => price.config.interval === interval) ||
      (ents &&
        ents?.some((ent) => entToBillingInterval(ent.interval) === interval)),
  )!;
};

export const sortBillingIntervals = (intervals: BillingInterval[]) => {
  return intervals.sort((a, b) => {
    return BillingIntervalOrder.indexOf(a) - BillingIntervalOrder.indexOf(b);
  });
};

export const sortPricesByInterval = (prices: Price[]) => {
  return prices.sort((a, b) => {
    return compareBillingIntervals(a.config.interval, b.config.interval);
  });
};
