import { APIVersion, BillingType, FullCusProduct, Price } from "@autumn/shared";
import { getBillingType } from "../priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";

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

export const isV4Usage = ({
  price,
  cusProduct,
}: {
  price: Price;
  cusProduct: FullCusProduct;
}) => {
  const billingType = getBillingType(price.config);

  return (
    billingType == BillingType.UsageInArrear &&
    (cusProduct.api_version == APIVersion.v1_4 ||
      notNullish(cusProduct.internal_entity_id))
  );
};
