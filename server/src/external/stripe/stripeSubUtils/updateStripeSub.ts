import Stripe from "stripe";
import { BillingInterval, AttachConfig } from "@autumn/shared";
import { ProrationBehavior } from "@/internal/customers/change-product/handleUpgrade.js";
import { getStripeProrationBehavior } from "../stripeSubUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { createProrationInvoice } from "./updateStripeSub/createProrationinvoice.js";
import {
  createUsageInvoiceItems,
  resetUsageBalances,
} from "@/internal/customers/attach/attachFunctions/upgradeFlow/createUsageInvoiceItems.js";
import { attachParamToCusProducts } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { getContUseInvoiceItems } from "@/internal/customers/attach/attachFunctions/upgradeFlow/getContUseInvoiceItems.js";
import { createAndFilterContUseItems } from "@/internal/customers/attach/attachFunctions/upgradeFlow/createAndFilterContUseItems.js";

export const updateStripeSubscription = async ({
  db,
  attachParams,
  config,
  trialEnd,
  stripeSubs,
  itemSet,
  logger,
  interval,
}: {
  db: DrizzleCli;
  attachParams: AttachParams;
  config: AttachConfig;
  stripeSubs: Stripe.Subscription[];
  trialEnd?: number;
  itemSet: ItemSet;
  shouldPreview?: boolean;
  logger: any;
  interval?: BillingInterval;
}) => {
  const { curMainProduct } = attachParamToCusProducts({ attachParams });
  const { stripeCli, customer, org, paymentMethod } = attachParams;
  const { invoiceOnly, proration } = config;
  const curSub = stripeSubs[0];

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

  // 1. Update subscription
  let sub: Stripe.Subscription | null = null;
  let stripeProration =
    proration == ProrationBehavior.None ? "none" : "create_prorations";

  try {
    sub = await stripeCli.subscriptions.update(curSub.id, {
      items: subItems,
      proration_behavior: stripeProration,
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

  const latestInvoice = sub.latest_invoice as Stripe.Invoice;

  if (proration == ProrationBehavior.None) {
    return {
      preview: null,
      sub: {
        ...sub,
        latest_invoice: latestInvoice.id,
      },
      invoice: null,
    };
  }

  // 3. Create invoice items for remaining usages
  let invoice: Stripe.Invoice | null = null;
  let { cusEntIds } = await createUsageInvoiceItems({
    db,
    attachParams,
    cusProduct: curMainProduct!,
    stripeSubs,
    logger,
  });

  await createAndFilterContUseItems({
    attachParams,
    curMainProduct: curMainProduct!,
    stripeSubs,
    interval,
    logger,
  });

  if (proration === ProrationBehavior.Immediately) {
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

  await resetUsageBalances({
    db,
    cusEntIds,
    cusProduct: curMainProduct!,
  });

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

// if (shouldPreview) {
//   let preview = await stripeCli.invoices.createPreview({
//     subscription_details: {
//       items: subItems,
//       proration_behavior: getStripeProrationBehavior({
//         org,
//         prorationBehavior: proration,
//       }) as any,
//       trial_end: trialEnd as any,
//     },
//     subscription: curSub.id,
//     invoice_items: subInvoiceItems,
//     customer: customer.processor.id,
//   });
//   return {
//     preview,
//     sub: null,
//     invoice: null,
//   };
// }
