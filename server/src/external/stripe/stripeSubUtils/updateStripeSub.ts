import RecaseError from "@/utils/errorUtils.js";
import {
  ErrCode,
  BillingInterval,
  BillingType,
  FeatureUsageType,
  AttachConfig,
  FullCusProduct,
} from "@autumn/shared";

import Stripe from "stripe";
import { ProrationBehavior } from "@/internal/customers/change-product/handleUpgrade.js";
import { getStripeProrationBehavior } from "../stripeSubUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { payForInvoice } from "../stripeInvoiceUtils.js";
import { findPriceInStripeItems } from "./stripeSubItemUtils.js";
import { priceToFeature } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { createProrationInvoice } from "./updateStripeSub/createProrationinvoice.js";

export const updateStripeSubscription = async ({
  db,
  attachParams,
  curCusProduct,
  config,
  curSub,
  trialEnd,
  itemSet,
  shouldPreview,
  logger,
}: {
  db: DrizzleCli;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
  config: AttachConfig;
  curSub: Stripe.Subscription;
  trialEnd?: number | null;
  itemSet: ItemSet;
  shouldPreview?: boolean;
  logger: any;
}) => {
  const { stripeCli, customer, org, features, paymentMethod } = attachParams;
  const { invoiceOnly, proration } = config;

  let { items, prices } = itemSet;

  let subItems = items.filter(
    (i: any, index: number) =>
      i.deleted || prices[index].config!.interval !== BillingInterval.OneOff,
  );

  let subInvoiceItems = items.filter((i: any, index: number) => {
    if (index < prices.length) {
      return prices[index].config!.interval === BillingInterval.OneOff;
    }

    return false;
  });

  if (shouldPreview) {
    let preview = await stripeCli.invoices.createPreview({
      subscription_details: {
        items: subItems,
        proration_behavior: getStripeProrationBehavior({
          org,
          prorationBehavior: proration,
        }) as any,
        trial_end: trialEnd as any,
      },
      subscription: curSub.id,
      invoice_items: subInvoiceItems,
      customer: customer.processor.id,
    });
    return {
      preview,
      sub: null,
      invoice: null,
    };
  }

  // 1. Update subscription
  let sub: Stripe.Subscription | null = null;
  try {
    sub = await stripeCli.subscriptions.update(curSub.id, {
      items: subItems,
      proration_behavior: "create_prorations",
      trial_end: trialEnd,
      default_payment_method: paymentMethod?.id,
      add_invoice_items: subInvoiceItems,
      ...((invoiceOnly && {
        collection_method: "send_invoice",
        days_until_due: 30,
      }) as any),
      payment_behavior: "error_if_incomplete",
      expand: ["latest_invoice"],
    });
  } catch (error: any) {
    throw error;
  }

  // 2. Try to pay invoice
  let invoice: Stripe.Invoice | null = null;
  const latestInvoice = sub.latest_invoice as Stripe.Invoice;

  if (proration === ProrationBehavior.Immediately) {
    // If latest invoice is different, no need to create a new invoice
    if (latestInvoice.id != curSub.latest_invoice) {
      sub.latest_invoice = latestInvoice.id;
      return {
        preview: null,
        sub,
        invoice: latestInvoice,
      };
    }

    invoice = await createProrationInvoice({
      attachParams,
      invoiceOnly,
      curSub,
      updatedSub: sub,
      logger,
    });
  }

  // Upsert sub
  await SubService.addUsageFeatures({
    db,
    stripeId: curSub.id,
    usageFeatures: itemSet.usageFeatures,
    orgId: org.id,
    env: customer.env,
  });

  if (invoice) {
    sub.latest_invoice = invoice.id;
  } else {
    sub.latest_invoice = null;
  }

  return {
    preview: null,
    sub,
    invoice,
  };
};
