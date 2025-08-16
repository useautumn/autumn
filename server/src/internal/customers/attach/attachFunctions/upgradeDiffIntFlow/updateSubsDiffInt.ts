import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { AttachConfig, FullCusProduct } from "@autumn/shared";
import { updateCurSchedules } from "./updateCurSchedules.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { addSubItemsToRemove } from "../attachFuncUtils.js";
import { updateStripeSub } from "../../attachUtils/updateStripeSub/updateStripeSub.js";
import {
  createUsageInvoiceItems,
  resetUsageBalances,
} from "./createUsageInvoiceItems.js";

export const updateSubsDiffInt = async ({
  db,
  stripeCli,
  curCusProduct,
  attachParams,
  stripeSubs,
  logger,
  config,
  shouldPreview = false,
}: {
  db: DrizzleCli;
  stripeCli: Stripe;
  curCusProduct: FullCusProduct;
  attachParams: AttachParams;
  stripeSubs: Stripe.Subscription[];
  logger: any;

  config: AttachConfig;

  shouldPreview?: boolean;
}) => {
  const itemSets = await getStripeSubItems({
    attachParams,
    carryExistingUsages: config.carryUsage,
  });

  const firstSub = stripeSubs?.[0];
  const firstItemSet = itemSets?.[0];

  await addSubItemsToRemove({
    sub: firstSub,
    cusProduct: curCusProduct,
    itemSet: firstItemSet,
  });

  // throw new Error("Stop");

  let trialEnd = config.disableTrial
    ? undefined
    : freeTrialToStripeTimestamp({
        freeTrial: attachParams.freeTrial,
        now: attachParams.now,
      });

  // 2. Create prorations for single use items
  let { invoiceItems, cusEntIds } = await createUsageInvoiceItems({
    db,
    attachParams,
    cusProduct: curCusProduct,
    stripeSubs,
    logger,
  });

  // 3. Update current subscription
  logger.info("1.2: Updating current subscription");
  const { updatedSub, latestInvoice } = await updateStripeSub({
    db,
    attachParams,
    config,
    trialEnd,
    logger,
    itemSet: firstItemSet,
    shouldPreview,
    stripeSubs,
  });

  await resetUsageBalances({
    db,
    cusEntIds,
    cusProduct: curCusProduct,
  });

  let newSubs = [updatedSub!];
  const newInvoiceIds = latestInvoice ? [latestInvoice.id] : [];

  // 4. Update current sub schedules if exist...
  logger.info("1.3 Updating current sub schedules");
  await updateCurSchedules({
    db,
    stripeCli,
    curCusProduct,
    attachParams,
    itemSets,
    logger,
  });

  // 5. Cancel other subscriptions
  for (const sub of stripeSubs.slice(1)) {
    logger.info(`1.4: canceling additional sub: ${sub.id}`);

    // Filter out
    await stripeCli.subscriptions.cancel(sub.id, {
      prorate: true,
      cancellation_details: {
        comment: "autumn_upgrade",
      },
    });
  }

  // 6. Create subs for other intervals
  for (const itemSet of itemSets.slice(1)) {
    const newSub = await createStripeSub({
      db,
      stripeCli,
      customer: attachParams.customer,
      org: attachParams.org,
      itemSet,
      invoiceOnly: attachParams.invoiceOnly || false,
      freeTrial: attachParams.freeTrial,
      // anchorToUnix: updatedSub!.current_period_end! * 1000,
      now: attachParams.now,
    });

    newSubs.push(newSub);
    const latestInvoice = newSub.latest_invoice as Stripe.Invoice;
    newInvoiceIds.push(latestInvoice.id);
  }

  return {
    newSubs,
    invoice: latestInvoice,
    newInvoiceIds,
  };
};
