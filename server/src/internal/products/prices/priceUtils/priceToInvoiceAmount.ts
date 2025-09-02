import {
  BillingType,
  Feature,
  FixedPriceConfig,
  Infinite,
  Price,
  ProductItem,
  UsageModel,
  UsagePriceConfig,
} from "@autumn/shared";
import { isFixedPrice } from "./usagePriceUtils/classifyUsagePrice.js";
import { getBillingType } from "../priceUtils.js";
import { Decimal } from "decimal.js";
import { nullish } from "@/utils/genUtils.js";
import {
  calculateProrationAmount,
  Proration,
} from "@/internal/invoices/prorationUtils.js";
import { itemToPriceAndEnt } from "../../product-items/productItemUtils/itemToPriceAndEnt.js";
import { isPriceItem } from "../../product-items/productItemUtils/getItemType.js";

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

export const itemToInvoiceAmount = ({
  item,
  quantity,
  overage,
}: {
  item: ProductItem;
  quantity?: number;
  overage?: number;
}) => {
  let amount = 0;
  if (isPriceItem(item)) {
    amount = item.price!;
  }

  if (!nullish(quantity) && !nullish(overage)) {
    throw new Error(
      `itemToInvoiceAmount: quantity or overage is required, autumn item: ${item.feature_id}`
    );
  }

  let price = {
    config: {
      usage_tiers: item.tiers || [
        {
          to: Infinite,
          amount: item.price!,
        },
      ],
      billing_units: item.billing_units || 1,
    },
  } as unknown as Price;

  if (item.usage_model == UsageModel.Prepaid) {
    amount = getAmountForQuantity({ price, quantity: quantity! });
  } else {
    amount = getAmountForQuantity({ price, quantity: overage! });
  }

  return amount;
};

export const priceToInvoiceAmount = ({
  price,
  item,
  quantity,
  productQuantity,
  overage,
  proration,
  now,
}: {
  price?: Price;
  item?: ProductItem;
  quantity?: number; // quantity should be multiplied by billing units
  productQuantity?: number;
  overage?: number;
  proration?: Proration;
  now?: number;
}) => {
  // 1. If fixed price, just return amount

  let amount = 0;

  if (price) {
    if (isFixedPrice({ price })) {
      amount = (price.config as FixedPriceConfig).amount;
      if (productQuantity) {
        amount = new Decimal(amount).mul(productQuantity).toNumber();
      }
    } else {
      const config = price.config as UsagePriceConfig;
      let billingType = getBillingType(config);

      if (!nullish(quantity) && !nullish(overage)) {
        throw new Error(
          `getAmountForPrice: quantity or overage is required, autumn price: ${price.id}`
        );
      }

      if (billingType == BillingType.UsageInAdvance) {
        amount = getAmountForQuantity({ price, quantity: quantity! });
      } else {
        amount = getAmountForQuantity({ price, quantity: overage! });
      }
    }
  } else {
    amount = itemToInvoiceAmount({ item: item!, quantity, overage });
  }

  if (proration) {
    return calculateProrationAmount({
      periodEnd: proration.end,
      periodStart: proration.start,
      now: now || Date.now(),
      amount,
      allowNegative: true,
    });
  }

  return amount;
};
