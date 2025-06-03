import { BillingType, Price } from "@autumn/shared";
import { getBillingType } from "../priceUtils.js";

export const isUsagePrice = ({ price }: { price: Price }) => {
  let billingType = getBillingType(price.config);

  return (
    billingType == BillingType.UsageInArrear ||
    billingType == BillingType.InArrearProrated ||
    billingType == BillingType.UsageInAdvance
  );
};

export const isFixedPrice = ({ price }: { price: Price }) => {
  let billingType = getBillingType(price.config);

  return (
    billingType == BillingType.FixedCycle || billingType == BillingType.OneOff
  );
};

export const hasPrepaidPrice = ({ prices }: { prices: Price[] }) => {
  return prices.some(
    (price) => getBillingType(price.config) == BillingType.UsageInAdvance,
  );
};
