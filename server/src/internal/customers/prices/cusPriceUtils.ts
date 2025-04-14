import {
  FullCustomerEntitlement,
  FullCustomerPrice,
  UsagePriceConfig,
} from "@autumn/shared";

export const getRelatedCusEnt = ({
  cusPrice,
  cusEnts,
}: {
  cusPrice: FullCustomerPrice;
  cusEnts: FullCustomerEntitlement[];
}) => {
  let config = cusPrice.price.config as UsagePriceConfig;
  if (!config) {
    console.log("No config found for cusPrice", cusPrice);
    return null;
  }

  const cusEnt = cusEnts.find(
    (ce) =>
      ce.customer_product_id == cusPrice.customer_product_id &&
      ce.entitlement.id == cusPrice.price.entitlement_id
  );

  return cusEnt;
};
