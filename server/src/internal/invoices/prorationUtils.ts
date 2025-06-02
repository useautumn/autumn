import { Decimal } from "decimal.js";

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

  const proratedAmount = num.div(denom).mul(amount).div(100).toDecimalPlaces(2);

  return proratedAmount;
};
