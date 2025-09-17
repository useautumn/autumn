import { newPriceToInvoiceDescription } from "@/internal/invoices/invoiceFormatUtils.js";
import { getProration } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import {
  getPriceEntitlement,
  getPriceForOverage,
} from "@/internal/products/prices/priceUtils.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import {
  isFixedPrice,
  isOneOffPrice,
} from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import {
  formatReward,
  getAmountAfterReward,
  getAmountAfterStripeDiscounts,
} from "@/internal/rewards/rewardUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";

import {
  EntitlementWithFeature,
  formatAmount,
  FullProduct,
  Organization,
  Price,
  Reward,
} from "@autumn/shared";
import Stripe from "stripe";

export const priceToNewPreviewItem = ({
  org,
  price,
  entitlements,
  skipOneOff,
  now,
  anchor,
  productQuantity = 1,
  product,
  onTrial,
  rewards,
  subDiscounts,
}: {
  org: Organization;
  price: Price;
  entitlements: EntitlementWithFeature[];
  skipOneOff?: boolean;
  now?: number;
  anchor?: number;
  productQuantity?: number;
  product: FullProduct;
  onTrial?: boolean;
  rewards?: Reward[];
  subDiscounts?: Stripe.Discount[];
}) => {
  if (skipOneOff && isOneOffPrice({ price })) return;

  now = now ?? Date.now();

  const ent = getPriceEntitlement(price, entitlements);

  const finalProration = getProration({
    anchor,
    now,
    intervalConfig: {
      interval: price.config.interval!,
      intervalCount: price.config.interval_count || 1,
    },
  });

  const applyRewards = rewards?.filter(
    (r) =>
      r.discount_config?.price_ids?.includes(price.id) ||
      r.discount_config?.apply_to_all
  );

  for (const reward of applyRewards ?? []) {
    console.log("Apply Reward", formatReward({ reward }));
  }

  if (isFixedPrice({ price })) {
    let amount = priceToInvoiceAmount({
      price,
      quantity: 1,
      proration: finalProration,
      productQuantity,
      now,
    });

    if (onTrial) {
      amount = 0;
    }

    for (const reward of applyRewards ?? []) {
      amount = getAmountAfterReward({
        amount,
        reward,
        subDiscounts: subDiscounts ?? [],
      });
    }

    amount = getAmountAfterStripeDiscounts({
      price,
      amount,
      product,
      stripeDiscounts: subDiscounts ?? [],
    });

    let description = newPriceToInvoiceDescription({
      org,
      price,
      product,
    });

    if (productQuantity > 1) {
      description = `${description} x ${productQuantity}`;
    }

    if (finalProration) {
      description = `${description} (from ${formatUnixToDate(now)})`;
    }

    return {
      price_id: price.id,
      price: formatAmount({ org, amount }),
      description,
      amount,
      usage_model: priceToUsageModel(price),
      feature_id: ent?.feature_id,
    };
  }
};
