import Stripe from "stripe";
import { BillingType, Feature, FeatureUsageType } from "@autumn/shared";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { FullCusProduct } from "@autumn/shared";
import { findPriceInStripeItems } from "../stripeSubItemUtils.js";
import { priceToFeature } from "@/internal/products/prices/priceUtils/convertPrice.js";

// For prepaid single use prices...
export const removePrepaidSingleUseItems = async ({
  stripeCli,
  curCusProduct,
  features,
  invoice,
}: {
  stripeCli: Stripe;
  curCusProduct: FullCusProduct;
  features: Feature[];
  invoice: Stripe.Invoice;
}) => {
  const curPrices = cusProductToPrices({ cusProduct: curCusProduct });

  for (const item of invoice.lines.data) {
    let price = findPriceInStripeItems({
      prices: curPrices,
      subItem: item,
      billingType: BillingType.UsageInAdvance,
    });

    if (!price) continue;

    let feature = priceToFeature({ price, features })!;
    if (feature.config.usage_type == FeatureUsageType.Single) {
      console.log("Deleting item:", item.id, "Feature:", feature.id);
      await stripeCli.invoiceItems.del(item.id);
    }
  }
};
