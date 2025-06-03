import { Decimal } from "decimal.js";

export type Proration = {
  start: number;
  end: number;
};

export const calculateProrationAmount = ({
  periodEnd,
  periodStart,
  now,
  amount,
}: {
  periodEnd: number;
  periodStart: number;
  now: number;
  amount: number;
}) => {
  const num = new Decimal(periodEnd).minus(now);
  const denom = new Decimal(periodEnd).minus(periodStart);

  const proratedAmount = num.div(denom).mul(amount);
  if (proratedAmount.lte(0)) {
    return 0;
  }

  return proratedAmount.toNumber();
};
