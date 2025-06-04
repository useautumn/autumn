import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";
import { updateStripeSubscription } from "@/external/stripe/stripeSubUtils/updateStripeSub.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { AttachConfig, FullCusProduct } from "@autumn/shared";
import { subItemInCusProduct } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { updateCurSchedules } from "./updateCurSchedules.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import {
  createUsageInvoiceItems,
  resetUsageBalances,
} from "./createUsageInvoiceItems.js";
import { formatUnixToDateTime } from "@/utils/genUtils.js";

// UPGRADE FUNCTIONS

export const updateStripeSubs = async ({
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

  const firstSub = stripeSubs[0];
  const firstItemSet = itemSets[0];

  // 1. Remove items from current sub that belong to old product
  for (const item of firstSub.items.data) {
    let shouldRemove = subItemInCusProduct({
      cusProduct: curCusProduct,
      subItem: item,
    });

    if (shouldRemove) {
      firstItemSet.items.push({
        id: item.id,
        deleted: true,
      });
    }
  }

  let trialEnd = config.disableTrial
    ? null
    : freeTrialToStripeTimestamp({
        freeTrial: attachParams.freeTrial,
        now: attachParams.now,
      });

  // 2. Create invoice items for remaining usages
  const { cusEntIds } = await createUsageInvoiceItems({
    db,
    attachParams,
    cusProduct: curCusProduct,
    stripeSubs,
    logger,
  });

  // 3. Update current subscription
  logger.info("1.2: Updating current subscription");
  let newSubs: Stripe.Subscription[] = [];
  const subUpdateRes = await updateStripeSubscription({
    db,
    attachParams,
    curCusProduct,
    config,
    trialEnd,
    logger,
    itemSet: firstItemSet,
    shouldPreview,
    curSub: firstSub,
  });

  if (shouldPreview) {
    return {
      newSubs: [],
      updatePreview: subUpdateRes,
    };
  }

  let { sub: subUpdate } = subUpdateRes;
  subUpdate = subUpdate!;
  newSubs.push(subUpdate!);

  // 4. Update current sub schedules if exist...
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
      anchorToUnix: subUpdate.current_period_end * 1000,
      now: attachParams.now,
    });

    newSubs.push(newSub as Stripe.Subscription);
  }

  // 7. Update cus ents to reset usage
  await resetUsageBalances({
    db,
    cusEntIds,
    cusProduct: curCusProduct,
  });

  return {
    newSubs,
    updatePreview: null,
    invoice: subUpdateRes.invoice,
  };
};

// logger.info("1.1: Creating invoice items for usages");
// const { invoiceItems, cusEntIds } = await createUsageInvoiceItems({
//   db,
//   attachParams,
//   cusProduct: curCusProduct,
//   stripeSubs,
//   logger,
// });

// await createSubUpdateProrations({
//   db,
//   attachParams,
//   config,
//   curCusProduct,
//   stripeSubs,
//   itemSet: firstItemSet,
//   logger,
// });
