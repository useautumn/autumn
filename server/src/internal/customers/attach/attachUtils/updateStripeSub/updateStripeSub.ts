import Stripe from "stripe";
import { BillingInterval, AttachConfig, intervalsSame } from "@autumn/shared";
import { ProrationBehavior } from "@autumn/shared";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
  createUsageInvoiceItems,
  resetUsageBalances,
} from "@/internal/customers/attach/attachFunctions/upgradeDiffIntFlow/createUsageInvoiceItems.js";
import { attachParamToCusProducts } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { createAndFilterContUseItems } from "@/internal/customers/attach/attachUtils/getContUseItems/createContUseInvoiceItems.js";
import { createProrationInvoice } from "@/external/stripe/stripeSubUtils/updateStripeSub/createProrationinvoice.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";

export const getSubAndInvoiceItems = async ({
  itemSet,
}: {
  itemSet: ItemSet;
}) => {
  let { items, prices } = itemSet;

  let subItems = items.filter(
    (i: any, index: number) =>
      i.deleted || prices[index].config!.interval !== BillingInterval.OneOff
  );

  let addInvoiceItems = items.filter((i: any, index: number) => {
    if (index < prices.length) {
      return prices[index].config!.interval === BillingInterval.OneOff;
    }

    return false;
  });

  return {
    subItems,
    addInvoiceItems,
  };
};
export const updateStripeSub = async ({
  db,
  attachParams,
  config,
  trialEnd,
  stripeSubs,
  itemSet,
  logger,
  interval,
  intervalCount,
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
  intervalCount?: number;
}) => {
  const { curMainProduct } = attachParamToCusProducts({ attachParams });
  const { stripeCli, customer, org, paymentMethod } = attachParams;
  const { invoiceOnly, proration } = config;

  const { subItems, addInvoiceItems } = await getSubAndInvoiceItems({
    itemSet,
  });

  const curSub =
    (interval
      ? stripeSubs.find((s) => {
          let subInterval = subToAutumnInterval(s);
          return intervalsSame({
            intervalA: { interval, intervalCount },
            intervalB: subInterval,
          });
        })
      : stripeSubs[0]) || stripeSubs[0];

  // 1. Update subscription
  let updatedSub = await stripeCli.subscriptions.update(curSub.id, {
    items: subItems,
    proration_behavior:
      proration == ProrationBehavior.None ? "none" : "create_prorations",
    trial_end: trialEnd,
    default_payment_method: paymentMethod?.id,
    add_invoice_items: addInvoiceItems,
    ...((invoiceOnly && {
      collection_method: "send_invoice",
      days_until_due: 30,
    }) as any),
    payment_behavior: "error_if_incomplete",
    expand: ["latest_invoice"],
  });

  let latestInvoice = updatedSub.latest_invoice as Stripe.Invoice | null;

  if (proration == ProrationBehavior.None) {
    return {
      updatedSub,
      latestInvoice: null,
    };
  } else if (!config.sameIntervals) {
    return {
      updatedSub,
      latestInvoice: latestInvoice,
    };
  }

  // if (invoiceOnly && attachParams.finalizeInvoice) {
  //   try {
  //     await stripeCli.invoices.finalizeInvoice(latestInvoice?.id as string);
  //   } catch (error) {
  //     logger.error(`Failed to finalize invoice ${latestInvoice?.id}`, {
  //       error,
  //     });
  //   }
  // }

  // 2. Create prorations for single use items
  let { invoiceItems, cusEntIds } = await createUsageInvoiceItems({
    db,
    attachParams,
    cusProduct: curMainProduct!,
    sub: curSub,
    logger,
    interval: config.sameIntervals ? interval : undefined,
    intervalCount: config.sameIntervals ? intervalCount : undefined,
  });

  // 3. Create prorations for continuous use items
  let { replaceables } = await createAndFilterContUseItems({
    attachParams,
    curMainProduct: curMainProduct!,
    stripeSubs,
    interval,
    intervalCount,
    logger,
  });

  if (proration === ProrationBehavior.Immediately) {
    latestInvoice = await createProrationInvoice({
      attachParams,
      invoiceOnly,
      curSub,
      updatedSub,
      logger,
    });
  }

  await resetUsageBalances({
    db,
    cusEntIds,
    cusProduct: curMainProduct!,
  });

  await SubService.addUsageFeatures({
    db,
    stripeId: curSub.id,
    usageFeatures: itemSet.usageFeatures,
    orgId: org.id,
    env: customer.env,
  });

  if (invoiceOnly && attachParams.finalizeInvoice) {
    logger.info(`FINALIZING INVOICE ${latestInvoice?.id}`);
    try {
      latestInvoice = await stripeCli.invoices.finalizeInvoice(
        latestInvoice?.id as string
      );
    } catch (error) {
      logger.error(`Failed to finalize invoice ${latestInvoice?.id}`, {
        error,
      });
    }
  }

  return {
    updatedSub,
    latestInvoice: latestInvoice,
    cusEntIds,
    replaceables,
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
