import Stripe from "stripe";
import { constructPrice } from "../priceUtils.js";
import { FullProduct, PriceType } from "@autumn/shared";
import { subItemToAutumnInterval } from "@/external/stripe/utils.js";

export const subItemToFixedPrice = ({
  subItem,
  product,
  basePrice,
}: {
  subItem: Stripe.SubscriptionItem;
  product: FullProduct;
  basePrice?: number;
}) => {
  const { price } = subItem;

  const { interval, intervalCount } = subItemToAutumnInterval(subItem);
  return constructPrice({
    internalProductId: product.internal_id,
    isCustom: true,
    orgId: product.org_id,
    fixedConfig: {
      type: PriceType.Fixed,
      amount: basePrice || (price.unit_amount || 0) / 100,
      interval,
      interval_count: intervalCount,
      stripe_price_id: price.id,
    },
  });
};
