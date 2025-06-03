import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";
import { updateStripeSubscription } from "@/external/stripe/stripeSubUtils/updateStripeSub.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { FullCusProduct } from "@autumn/shared";
import { AttachConfig } from "../../models/AttachFlags.js";
import { subItemInCusProduct } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { updateCurSchedules } from "./updateCurSchedules.js";
import { formatUnixToDateTime } from "@/utils/genUtils.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";

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

  // console.log("Now:", formatUnixToDateTime(attachParams.now));
  // console.log("Free trial:", attachParams.freeTrial);
  // console.log("Trial end:", formatUnixToDateTime(trialEnd * 1000));
  // 2. Update current subscription
  let newSubs: Stripe.Subscription[] = [];
  const subUpdateRes = await updateStripeSubscription({
    db,
    stripeCli,
    subscriptionId: firstSub.id,
    trialEnd,
    org: attachParams.org,
    customer: attachParams.customer,
    invoiceOnly: attachParams.invoiceOnly || false,
    prorationBehavior: config.proration,
    logger,
    itemSet: firstItemSet,
    shouldPreview,
  });

  if (shouldPreview) {
    return {
      newSubs: [],
      updatePreview: subUpdateRes,
    };
  }

  let subUpdate = subUpdateRes as Stripe.Subscription;
  newSubs.push(subUpdate);

  // 3. Update current sub schedules if exist...
  await updateCurSchedules({
    db,
    stripeCli,
    curCusProduct,
    attachParams,
    itemSets,
    logger,
  });

  // 4. Cancel other subscriptions
  for (const sub of stripeSubs.slice(1)) {
    logger.info(`1.4: canceling additional sub: ${sub.id}`);
    await stripeCli.subscriptions.cancel(sub.id, {
      prorate: true,
      cancellation_details: {
        comment: "autumn_upgrade",
      },
    });
  }

  // 5. Create subs for other intervals
  const now = await getStripeNow({ stripeCli, stripeSub: subUpdate });
  for (const itemSet of itemSets.slice(1)) {
    const newSub = (await createStripeSub({
      db,
      stripeCli,
      customer: attachParams.customer,
      org: attachParams.org,
      itemSet,
      invoiceOnly: attachParams.invoiceOnly || false,
      freeTrial: attachParams.freeTrial,
      anchorToUnix: subUpdate.current_period_end * 1000,
      now,
    })) as Stripe.Subscription;

    newSubs.push(newSub);
  }

  return {
    newSubs,
    updatePreview: null,
  };
};
