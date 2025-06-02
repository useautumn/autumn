import { BillingInterval, Price } from "@autumn/shared";

const BillingIntervalOrder = [
  BillingInterval.Year,
  BillingInterval.SemiAnnual,
  BillingInterval.Quarter,
  BillingInterval.Month,
  BillingInterval.OneOff,
];

export const getFirstInterval = ({ prices }: { prices: Price[] }) => {
  return BillingIntervalOrder.find((interval) =>
    prices.some((price) => price.config.interval === interval),
  )!;
};
