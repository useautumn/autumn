import {
  ErrCode,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  getFeatureInvoiceDescription,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";
import { getTotalNegativeBalance } from "../cusEnts/cusEntUtils.js";
import { Decimal } from "decimal.js";
import { getPriceForOverage } from "@/internal/products/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";

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
      ce.entitlement.id == cusPrice.price.entitlement_id,
  );

  return cusEnt;
};

// Get overage for a cusPrice
export const getCusPriceUsage = ({
  cusPrice,
  price,
  cusProduct,
  logger,
}: {
  cusPrice?: FullCustomerPrice;
  price?: Price;
  cusProduct: FullCusProduct;
  logger: any;
}) => {
  if (!cusPrice) {
    cusPrice = cusProduct.customer_prices.find(
      (cp) => cp.price.id == price!.id,
    );
    if (!cusPrice) {
      throw new RecaseError({
        message: `getCusPriceUsage: No cusPrice found for price: ${price!.id}`,
        code: ErrCode.CusPriceNotFound,
      });
    }
  }

  // 1. Get related cusEnt
  const cusEnt = getRelatedCusEnt({
    cusPrice,
    cusEnts: cusProduct.customer_entitlements,
  });
  const config = cusPrice.price.config as UsagePriceConfig;

  if (!cusEnt) {
    logger.warn(`No cusEnt found for cusPrice: ${cusPrice.id}`);
    return {
      usage: 0,
      overage: 0,
      roundedUsage: 0,
    };
  }

  // 2. Get overage
  const totalNegativeBalance = getTotalNegativeBalance({
    cusEnt: cusEnt as any,
    balance: cusEnt.balance!,
    entities: cusEnt.entities!,
    billingUnits:
      (cusPrice.price.config as UsagePriceConfig).billing_units || 1,
  });

  const allowance = cusEnt.entitlement.allowance || 0;
  const usage = new Decimal(allowance).minus(totalNegativeBalance).toNumber();
  const billingUnits = config.billing_units || 1;

  const roundedQuantity =
    Math.ceil(new Decimal(usage).div(billingUnits).toNumber()) * billingUnits;

  const amount = getPriceForOverage(cusPrice.price, -totalNegativeBalance);

  const description = getFeatureInvoiceDescription({
    feature: cusEnt.entitlement.feature,
    usage,
  });

  return {
    usage, // total usage
    overage: -totalNegativeBalance, // usage that's past the allowance
    roundedUsage: roundedQuantity, // usage rounded to the nearest billing unit
    amount,
    description,
  };
};
