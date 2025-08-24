import Stripe from "stripe";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { AttachConfig, ProrationBehavior } from "@autumn/shared";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";
import {
  createUsageInvoiceItems,
  resetUsageBalances,
} from "../upgradeDiffIntFlow/createUsageInvoiceItems.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { createProrationInvoice } from "@/external/stripe/stripeSubUtils/updateStripeSub/createProrationinvoice.js";
import { createAndFilterContUseItems } from "../../attachUtils/getContUseItems/createContUseInvoiceItems.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getContUseInvoiceItems } from "../../attachUtils/getContUseItems/getContUseInvoiceItems.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { sanitizeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { SubService } from "@/internal/subscriptions/SubService.js";

export const updateStripeSub2 = async ({
  req,
  attachParams,
  config,
  curSub,
  itemSet,
  fromCreate = false,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
  config: AttachConfig;
  curSub: Stripe.Subscription;
  itemSet: ItemSet;
  fromCreate?: boolean;
}) => {
  const { db, logger } = req;
  const { curMainProduct } = attachParamToCusProducts({ attachParams });
  const { stripeCli, customer, org, paymentMethod } = attachParams;
  const { invoiceOnly, proration } = config;

  if (curSub.billing_mode.type !== "flexible") {
    curSub = await stripeCli.subscriptions.migrate(curSub.id, {
      billing_mode: { type: "flexible" },
    });
  }

  let trialEnd =
    config.disableTrial || config.carryTrial
      ? undefined
      : freeTrialToStripeTimestamp({
          freeTrial: attachParams.freeTrial,
          now: attachParams.now,
        });

  // 1. Update subscription
  let updatedSub = await stripeCli.subscriptions.update(curSub.id, {
    items: sanitizeSubItems(itemSet.subItems),
    proration_behavior:
      proration == ProrationBehavior.None
        ? "none"
        : fromCreate
          ? "always_invoice"
          : "create_prorations",
    trial_end: trialEnd,
    // default_payment_method: paymentMethod?.id,
    add_invoice_items: itemSet.invoiceItems,
    ...((invoiceOnly && {
      collection_method: "send_invoice",
      days_until_due: 30,
    }) as any),
    payment_behavior: "error_if_incomplete",
    expand: ["latest_invoice"],
  });

  let latestInvoice = updatedSub.latest_invoice as Stripe.Invoice | null;

  await SubService.updateFromStripe({ db, stripeSub: updatedSub });

  if (proration == ProrationBehavior.None) {
    return {
      updatedSub,
      latestInvoice: null,
    };
  }

  if (fromCreate) {
    return {
      updatedSub,
      latestInvoice: updatedSub.latest_invoice as Stripe.Invoice,
    };
  }

  // 2. Create prorations for single use items
  let { invoiceItems, cusEntIds } = await createUsageInvoiceItems({
    db,
    attachParams,
    cusProduct: curMainProduct!,
    // stripeSubs: [curSub],
    sub: curSub,
    logger,
  });

  // // 3. Create prorations for continuous use items
  let { replaceables, newItems } = await getContUseInvoiceItems({
    attachParams,
    cusProduct: curMainProduct!,
    sub: curSub,
    logger,
  });

  await createAndFilterContUseItems({
    attachParams,
    curMainProduct: curMainProduct!,
    sub: curSub,
    // interval: config.sameIntervals ? interval : undefined,
    // intervalCount: config.sameIntervals ? intervalCount : undefined,
    logger,
  });

  console.log("Replaceables: ", replaceables);

  if (proration === ProrationBehavior.Immediately) {
    latestInvoice = await createProrationInvoice({
      attachParams,
      invoiceOnly,
      curSub,
      updatedSub,
      logger,
    });

    console.log(`FINALIZED INVOICE ${latestInvoice?.id}`);
    console.log(latestInvoice?.lines.data.map((line) => line.description));
  }

  await resetUsageBalances({
    db,
    cusEntIds,
    cusProduct: curMainProduct!,
  });

  return {
    updatedSub,
    latestInvoice: latestInvoice,
    cusEntIds,
    replaceables,
  };
};

// await SubService.addUsageFeatures({
//   db,
//   stripeId: curSub.id,
//   usageFeatures: itemSet.usageFeatures,
//   orgId: org.id,
//   env: customer.env,
// });

// if (invoiceOnly && attachParams.finalizeInvoice) {
//   logger.info(`FINALIZING INVOICE ${latestInvoice?.id}`);
//   try {
//     latestInvoice = await stripeCli.invoices.finalizeInvoice(
//       latestInvoice?.id as string
//     );
//   } catch (error) {
//     logger.error(`Failed to finalize invoice ${latestInvoice?.id}`, {
//       error,
//     });
//   }
// }
