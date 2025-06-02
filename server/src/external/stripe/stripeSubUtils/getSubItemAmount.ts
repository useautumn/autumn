import RecaseError from "@/utils/errorUtils.js";
import Stripe from "stripe";
import { Decimal } from "decimal.js";
import { notNullish, nullish } from "@/utils/genUtils.js";

const calculateTieredAmount = ({
  tiers,
  quantity,
}: {
  tiers: Stripe.Price.Tier[];
  quantity: number;
}) => {
  let total = new Decimal(0);
  let quantityCursor = quantity;
  for (const tier of tiers) {
    const unitAmount = new Decimal(
      tier.unit_amount_decimal || tier.unit_amount!,
    );

    if (notNullish(tier.up_to)) {
      const bracketQuantity = Math.min(tier.up_to!, quantityCursor);
      total = total.add(unitAmount.mul(bracketQuantity));

      quantityCursor = quantityCursor - bracketQuantity;
    } else {
      total = total.add(unitAmount.mul(quantityCursor));
      quantityCursor = 0;
    }

    if (quantityCursor <= 0) {
      break;
    }
  }

  return total.toNumber();
};

export const getSubItemAmount = ({
  subItem,
}: {
  subItem: Stripe.SubscriptionItem;
}) => {
  let price = subItem.price;

  const quantity = subItem.quantity || 0;

  if (price.billing_scheme == "tiered") {
    let tieredAmount = calculateTieredAmount({
      tiers: price.tiers!,
      quantity,
    });

    console.log("Tiered amount:", tieredAmount);

    return tieredAmount;
  }

  if (price.billing_scheme == "per_unit") {
    if (price.unit_amount_decimal) {
      return new Decimal(price.unit_amount_decimal).mul(quantity).toNumber();
    } else {
      return new Decimal(price.unit_amount || 0).mul(quantity).toNumber();
    }
  }

  return 0;
};
