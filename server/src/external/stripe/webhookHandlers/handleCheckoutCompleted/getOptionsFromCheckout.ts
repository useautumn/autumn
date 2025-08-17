import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
  getBillingType,
  getPriceEntitlement,
  priceIsOneOffAndTiered,
} from "@/internal/products/prices/priceUtils.js";
import { BillingType, UsagePriceConfig } from "@autumn/shared";
import Stripe from "stripe";
import { findStripeItemForPrice } from "../../stripeSubUtils/stripeSubItemUtils.js";

export const getOptionsFromCheckoutSession = async ({
  checkoutSession,
  attachParams,
}: {
  checkoutSession: Stripe.Checkout.Session;
  attachParams: AttachParams;
}) => {
  const usageInAdvanceExists = attachParams.prices.some(
    (price) =>
      getBillingType(price.config as UsagePriceConfig) ==
      BillingType.UsageInAdvance
  );

  if (!usageInAdvanceExists) {
    return;
  }

  const { prices, entitlements: ents, optionsList } = attachParams;
  const lineItems: Stripe.LineItem[] = checkoutSession.line_items?.data || [];

  // Should still work with old method?
  for (const price of prices) {
    let config = price.config as UsagePriceConfig;

    if (getBillingType(config) != BillingType.UsageInAdvance) {
      continue;
    }

    const lineItem = findStripeItemForPrice({
      price,
      stripeItems: lineItems,
    });

    let quantity = 0;

    if (lineItem) {
      let relatedEnt = getPriceEntitlement(price, ents);

      if (priceIsOneOffAndTiered(price, relatedEnt)) {
        quantity = (lineItem.quantity || 0) + (relatedEnt.allowance || 0);
      } else {
        quantity = lineItem.quantity || 0;
      }
    }

    const index = optionsList.findIndex(
      (feature) => feature.internal_feature_id == config.internal_feature_id
    );

    if (index == -1) {
      attachParams.optionsList.push({
        feature_id: config.feature_id,
        internal_feature_id: config.internal_feature_id,
        quantity,
      });
    } else {
      attachParams.optionsList[index].quantity = quantity;
    }
  }
};
