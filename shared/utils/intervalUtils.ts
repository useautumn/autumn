import { BillingInterval } from "../models/productModels/priceModels/priceEnums.js";

export const intervalToValue = (
  interval: BillingInterval,
  intervalCount?: number | null
) => {
  const intervalToBaseVal: Record<BillingInterval, number> = {
    [BillingInterval.OneOff]: 0,
    [BillingInterval.Month]: 1,
    [BillingInterval.Quarter]: 3,
    [BillingInterval.SemiAnnual]: 6,
    [BillingInterval.Year]: 12,
  };

  return intervalToBaseVal[interval] * (intervalCount ?? 1);
};

export type IntervalConfig = {
  interval: BillingInterval;
  intervalCount?: number | null;
};

export const intervalsDifferent = ({
  intervalA,
  intervalB,
}: {
  intervalA: IntervalConfig;
  intervalB: IntervalConfig;
}) => {
  let valA = intervalToValue(intervalA.interval, intervalA.intervalCount);
  let valB = intervalToValue(intervalB.interval, intervalB.intervalCount);
  return valA != valB;
};

export const intervalsSame = ({
  intervalA,
  intervalB,
}: {
  intervalA: IntervalConfig;
  intervalB: IntervalConfig;
}) => {
  return !intervalsDifferent({ intervalA, intervalB });
};
