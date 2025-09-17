import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachConfig, FullCusProduct } from "@autumn/shared";

import Stripe from "stripe";
import { paramsToScheduleItems } from "../../mergeUtils/paramsToScheduleItems.js";
import {
  logPhases,
  getCurrentPhaseIndex,
} from "../../mergeUtils/phaseUtils/phaseUtils.js";
import { updateCurSchedule } from "../../mergeUtils/updateCurSchedule.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
  ACTIVE_STATUSES,
  CusProductService,
} from "@/internal/customers/cusProducts/CusProductService.js";
import { attachParamsToCurCusProduct } from "../../attachUtils/convertAttachParams.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";

export const handleUpgradeFlowSchedule = async ({
  req,
  attachParams,
  config,
  schedule,
  curSub,
  removeCusProducts,
  logger,
  fromAddProduct = false,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
  config: AttachConfig;
  schedule: Stripe.SubscriptionSchedule;
  curSub: Stripe.Subscription;
  removeCusProducts?: FullCusProduct[];
  logger: any;
  fromAddProduct?: boolean;
}) => {
  if (fromAddProduct) {
    logger.info(`ADD PRODUCT FLOW, updating schedule ${schedule?.id}`);
  } else {
    logger.info(`UPGRADE FLOW, updating schedule ${schedule?.id}`);
  }

  const { stripeCli, customer, prices } = attachParams;
  const curCusProduct = attachParamsToCurCusProduct({ attachParams });

  const currentPhaseIndex = getCurrentPhaseIndex({
    schedule,
    now: attachParams.now,
  });

  const nextPhaseIndex = currentPhaseIndex + 1;

  if (currentPhaseIndex == -1 || nextPhaseIndex >= schedule.phases.length)
    return;

  const newItems = await paramsToScheduleItems({
    req,
    schedule,
    attachParams,
    config,
    billingPeriodEnd: schedule?.phases?.[nextPhaseIndex]?.start_date,
    removeCusProducts,
  });

  // Should release schedule...
  const newCurPhaseIndex = getCurrentPhaseIndex({
    schedule: { phases: newItems.phases } as any,
    now: attachParams.now,
  });

  // If there are no subsequent phases, release schedule...
  // Example: mergedUpgrade4.test.ts, mergedCancel2.test.ts
  // pro, pro -> free, pro -> premium, pro (need to cancel initial schedule)
  if (newCurPhaseIndex == newItems.phases.length - 1) {
    logger.info(
      `UPGRADE FLOW: no subsequent phases, releasing schedule ${schedule?.id}`
    );
    await stripeCli.subscriptionSchedules.release(schedule!.id);
    await CusProductService.updateByStripeScheduledId({
      db: req.db,
      stripeScheduledId: schedule!.id,
      updates: { scheduled_ids: [] },
    });

    // Should we cancel the sub...?
    // If all other products are canceled, and new product is free, cancel the sub...
    const shouldCancelSub =
      customer.customer_products
        .filter(
          (cp) =>
            cp.id !== curCusProduct?.id &&
            cp.subscription_ids?.includes(curSub.id) &&
            ACTIVE_STATUSES.includes(cp.status)
        )
        .every((cp) => cp.canceled) && isFreeProduct(prices);

    if (shouldCancelSub) {
      logger.info(`UPGRADE FLOW: canceling sub ${curSub?.id}`);
      await stripeCli.subscriptions.update(curSub.id, {
        cancel_at_period_end: true,
      });
    }

    return;
  }

  // await logPhases({
  //   phases: newItems.phases,
  //   db: req.db,
  // });

  await updateCurSchedule({
    req,
    attachParams,
    schedule,
    newPhases: newItems.phases,
    sub: curSub!,
  });
};
