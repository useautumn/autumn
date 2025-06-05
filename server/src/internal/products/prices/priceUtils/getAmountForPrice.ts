import {
  BillingType,
  FeatureOptions,
  FixedPriceConfig,
  Infinite,
  Price,
  TierInfinite,
  UsagePriceConfig,
} from "@autumn/shared";
import { isFixedPrice } from "./usagePriceUtils.js";
import { getBillingType } from "../priceUtils.js";
import { Decimal } from "decimal.js";

export const getAmountForQuantity = ({
  price,
  quantity,
}: {
  price: Price;
  quantity: number;
}) => {
  const config = price.config as UsagePriceConfig;

  let billingUnits = config.billing_units || 1;

  const roundedQuantity = new Decimal(quantity)
    .div(billingUnits)
    .ceil()
    .mul(billingUnits)
    .toNumber();

  let lastTierTo: number = 0;

  let amount = new Decimal(0);
  let remainingUsage = new Decimal(roundedQuantity);

  // console.log("Getting amount for quantity:", roundedQuantity);
  // console.log("Usage tiers:", config.usage_tiers);

  for (let i = 0; i < config.usage_tiers.length; i++) {
    let tier = config.usage_tiers[i];

    let usageWithinTier = new Decimal(0);
    if (tier.to == Infinite || tier.to == -1) {
      usageWithinTier = remainingUsage;
    } else {
      let tierUsage = new Decimal(tier.to).minus(lastTierTo);
      usageWithinTier = Decimal.min(remainingUsage, tierUsage);
      lastTierTo = tier.to;
    }

    let amountPerUnit = new Decimal(tier.amount).div(billingUnits);
    let amountWithinTier = amountPerUnit.mul(usageWithinTier);
    amount = amount.plus(amountWithinTier);
    remainingUsage = remainingUsage.minus(usageWithinTier);

    if (remainingUsage.lte(0)) {
      break;
    }
  }

  return amount.toDecimalPlaces(10).toNumber();
};

export const priceToInvoiceAmount = ({
  price,
  overage,
  quantity,
}: {
  price: Price;
  overage?: number;
  quantity?: number;
}) => {
  // 1. If fixed price, just return amount
  if (isFixedPrice({ price })) {
    return (price.config as FixedPriceConfig).amount;
  }

  const config = price.config as UsagePriceConfig;
  let billingType = getBillingType(config);

  if (!quantity && !overage) {
    throw new Error(
      `getAmountForPrice: quantity or overage is required, autumn price: ${price.id}`,
    );
  }

  if (billingType == BillingType.UsageInAdvance) {
    return getAmountForQuantity({ price, quantity: quantity! });
  } else {
    return getAmountForQuantity({ price, quantity: overage! });
  }
};
