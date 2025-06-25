import Stripe from "stripe";
import { constructPrice } from "../priceUtils.js";
import { FullProduct, PriceType } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import { subItemToAutumnInterval } from "tests/utils/stripeUtils.js";

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

  return constructPrice({
    internalProductId: product.internal_id,
    isCustom: true,
    orgId: product.org_id,
    fixedConfig: {
      type: PriceType.Fixed,
      amount: basePrice || (price.unit_amount || 0) / 100,
      interval: subItemToAutumnInterval(subItem)!,
      stripe_price_id: price.id,
    },
  });
};
