import { BillingInterval, Price } from "@autumn/shared";

const BillingIntervalOrder = [
  BillingInterval.Year,
  BillingInterval.SemiAnnual,
  BillingInterval.Quarter,
  BillingInterval.Month,
  BillingInterval.OneOff,
];

const ReversedBillingIntervalOrder = [
  BillingInterval.OneOff,
  BillingInterval.Month,
  BillingInterval.Quarter,
  BillingInterval.SemiAnnual,
  BillingInterval.Year,
];

export const getFirstInterval = ({ prices }: { prices: Price[] }) => {
  return BillingIntervalOrder.find((interval) =>
    prices.some((price) => price.config.interval === interval),
  )!;
};

export const getLastInterval = ({ prices }: { prices: Price[] }) => {
  return ReversedBillingIntervalOrder.find((interval) =>
    prices.some((price) => price.config.interval === interval),
  )!;
};

export const sortBillingIntervals = (intervals: BillingInterval[]) => {
  return intervals.sort((a, b) => {
    return BillingIntervalOrder.indexOf(a) - BillingIntervalOrder.indexOf(b);
  });
};
