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
  getTotalCusProdQuantity,
  FullCustomer,
} from "@autumn/shared";
import { logger } from "better-auth";
import Stripe from "stripe";
import { isTrialing } from "@autumn/shared";
import { formatUnixToDate, notNullish } from "@/utils/genUtils.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import {
  getPriceEntitlement,
  getPriceOptions,
} from "@/internal/products/prices/priceUtils.js";
import { cusProductToEnts } from "@autumn/shared";
import { isFixedPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getUnusedAmountAfterDiscount } from "@/internal/rewards/rewardUtils.js";
import { Decimal } from "decimal.js";

const getDiscountsApplied = ({
  invoiceItem,
  subDiscounts,
}: {
  invoiceItem?: Stripe.InvoiceLineItem;
  subDiscounts?: Stripe.Discount[];
}) => {
  if (!invoiceItem || !subDiscounts) return [];
  const discountsApplied: Stripe.Discount[] = [];
  for (const dAmount of invoiceItem?.discount_amounts || []) {
    const discount = subDiscounts?.find((d) => d.id == dAmount.discount);
    if (discount && dAmount.amount > 0) {
      // console.log("Discount applied: ", discount.id);
      // console.log("Amount off: ", dAmount.amount);
      discountsApplied.push(discount);
    }
  }
  return discountsApplied;
};
export const priceToUnusedPreviewItem = ({
  customer,
  price,
  stripeItems,
  cusProduct,
  now,
  org,
  subDiscounts,
  latestInvoice,
}: {
  customer?: FullCustomer;
  price: Price;
  stripeItems: Stripe.SubscriptionItem[];
  cusProduct: FullCusProduct;
  now?: number;
  org?: Organization;
  subDiscounts?: Stripe.Discount[];
  latestInvoice?: Stripe.Invoice;
}) => {
  now = now || Date.now();
  const onTrial = isTrialing({ cusProduct, now });

  const subItem = findStripeItemForPrice({
    price,
    stripeItems,
    stripeProdId: cusProduct?.product.processor?.id,
  }) as Stripe.SubscriptionItem | undefined;

  const invoiceItem = findStripeItemForPrice({
    price,
    invoiceLineItems: latestInvoice?.lines.data || [],
    stripeProdId: cusProduct?.product.processor?.id,
  }) as Stripe.InvoiceLineItem | undefined;

  if (!subItem) return undefined;

  const ents = cusProductToEnts({ cusProduct });
  const ent = getPriceEntitlement(price, ents);
  const options = getPriceOptions(price, cusProduct.options);
  const config = price.config as UsagePriceConfig;

  let quantity = notNullish(options?.quantity)
    ? options?.quantity! * config.billing_units!
    : 1;

  if (isFixedPrice({ price })) {
    quantity = customer
      ? getTotalCusProdQuantity({
          cusProducts: customer.customer_products,
          productId: cusProduct.product_id,
        })
      : cusProduct.quantity || 1;
  }

  const finalProration = getProration({
    now,
    interval: price.config.interval!,
    intervalCount: price.config.interval_count || 1,
    anchorToUnix: subItem?.current_period_end
      ? subItem.current_period_end * 1000
      : undefined,
  })!;

  let amount = onTrial
    ? 0
    : -priceToInvoiceAmount({
        price,
        quantity,
        proration: finalProration,
        productQuantity: quantity,
        now,
      });

  const ratio = new Decimal(quantity)
    .div(invoiceItem?.quantity || 1)
    .toNumber();

  amount = -getUnusedAmountAfterDiscount({
    amount,
    discountAmounts: invoiceItem?.discount_amounts || [],
    ratio,
  });

  let description = priceToInvoiceDescription({
    price,
    org,
    cusProduct,
    quantity,
    logger,
  });

  description = `Unused ${description}`;
  if (quantity && quantity > 1) {
    description = `${description} x ${quantity}`;
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
};
