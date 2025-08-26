import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { priceToInvoiceDescription } from "@/internal/invoices/invoiceFormatUtils.js";
import { getProration } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import {
  Price,
  FullCusProduct,
  Organization,
  formatAmount,
  UsagePriceConfig,
} from "@autumn/shared";
import { logger } from "better-auth";
import Stripe from "stripe";
import { isTrialing } from "../../cusProducts/cusProductUtils.js";
import { formatUnixToDate, notNullish } from "@/utils/genUtils.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import {
  getPriceEntitlement,
  getPriceOptions,
} from "@/internal/products/prices/priceUtils.js";
import { cusProductToEnts } from "../../cusProducts/cusProductUtils/convertCusProduct.js";

export const priceToUnusedPreviewItem = ({
  price,
  stripeItems,
  cusProduct,
  now,
  org,
}: {
  price: Price;
  stripeItems: Stripe.SubscriptionItem[];
  cusProduct: FullCusProduct;
  now?: number;
  org?: Organization;
}) => {
  now = now || Date.now();
  const onTrial = isTrialing({ cusProduct, now });

  // 1. Get price from stripe items
  const subItem = findStripeItemForPrice({
    price,
    stripeItems,
    stripeProdId: cusProduct?.product.processor?.id,
  }) as Stripe.SubscriptionItem | undefined;

  if (!subItem) return undefined;

  const ents = cusProductToEnts({ cusProduct });
  const ent = getPriceEntitlement(price, ents);
  const options = getPriceOptions(price, cusProduct.options);
  const config = price.config as UsagePriceConfig;

  const quantity = notNullish(options?.quantity)
    ? options?.quantity! * config.billing_units!
    : 1;

  const finalProration = getProration({
    now,
    interval: price.config.interval!,
    intervalCount: price.config.interval_count || 1,
    anchorToUnix: subItem?.current_period_end
      ? subItem.current_period_end * 1000
      : undefined,
  })!;

  const amount = onTrial
    ? 0
    : -priceToInvoiceAmount({
        price,
        quantity,
        proration: finalProration,
        productQuantity: cusProduct.quantity,
        now,
      });

  let description = priceToInvoiceDescription({
    price,
    org,
    cusProduct,
    quantity,
    logger,
  });

  description = `Unused ${description}`;
  if (cusProduct.quantity && cusProduct.quantity > 1) {
    description = `${description} x ${cusProduct.quantity}`;
  }

  if (finalProration) {
    description = `${description} (from ${formatUnixToDate(now)})`;
  }

  return {
    price: formatAmount({
      org: org,
      amount,
    }),
    description,
    amount,
    usage_model: priceToUsageModel(price),
    price_id: price.id!,
    feature_id: ent?.feature.id,
  };

  // return {
  //   // quantity: 1,
  //   amount,
  //   subItem,
  // };
  // const subItem = stripeItems.find((si) => {
  //   const config = price.config as UsagePriceConfig;

  //   return config.stripe_price_id == si.price?.id;
  // });

  // return subItem;
};
