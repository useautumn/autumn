import Stripe from "stripe";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { cancelCurSubs } from "@/internal/customers/change-product/handleDowngrade/cancelCurSubs.js";
import { updateScheduledSubWithNewItems } from "@/internal/customers/change-product/scheduleUtils/updateScheduleWithNewItems.js";
import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import { APIVersion, AttachScenario, SuccessCode } from "@autumn/shared";
import { handleNewScheduleForItemSet } from "./scheduleStripeSub.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
  attachToInsertParams,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { cusProductsToSchedules } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";

export const handleScheduleFunction = async ({
  req,
  res,
  attachParams,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
}) => {
  const logger = req.logtail;
  const product = attachParams.products[0];
  const { stripeCli } = attachParams;

  const { curMainProduct, curScheduledProduct } = attachParamToCusProducts({
    attachParams,
  });

  let curCusProduct = curMainProduct!;

  const curSubs = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids,
  });

  const latestPeriodEnd = curSubs[0].current_period_end;

  // 2. Cancel current subscriptions and fetch items from other cus products (to be added to new schedule)
  logger.info("2. Cancelling current subscription (at period end)");
  const intervalToOtherSubs = await cancelCurSubs({
    curSubs,
    stripeCli,
    curCusProduct,
  });

  // 3. Get schedules for current cus products
  logger.info(`3. Getting schedules for current cus products`);
  let schedules = await cusProductsToSchedules({
    cusProducts: [curMainProduct, curScheduledProduct],
    stripeCli,
  });

  // 4. Get item sets for new schedule
  const itemSets: any[] = await getStripeSubItems({
    attachParams,
    isCheckout: false,
  });

  // 5. Create / update schedules
  const stripeSchedules: Stripe.SubscriptionSchedule[] = [];
  for (const itemSet of itemSets) {
    let scheduleObj = schedules.find(
      (schedule) => schedule.interval === itemSet.interval,
    );

    // If schedule exists, update it
    if (scheduleObj) {
      const stripeSchedule = await updateScheduledSubWithNewItems({
        scheduleObj,
        newItems: itemSet.items,
        stripeCli,
        cusProductsForGroup: [curMainProduct, curScheduledProduct],
        itemSet: itemSet,
        db: req.db,
        org: attachParams.org,
        env: attachParams.customer.env,
      });

      stripeSchedules.push(stripeSchedule);
    }

    // If schedule does not exist, create it
    else {
      const stripeSchedule = await handleNewScheduleForItemSet({
        db: req.db,
        attachParams,
        latestPeriodEnd,
        itemSet,
        intervalToOtherSubs,
      });

      stripeSchedules.push(stripeSchedule);
    }
  }

  // 6. Remove scheduled ids from current cus product, will be added to new cus product
  const newScheduledIds = stripeSchedules.map((schedule) => schedule.id);

  await CusProductService.update({
    db: req.db,
    cusProductId: curCusProduct.id,
    updates: {
      scheduled_ids: curCusProduct.scheduled_ids?.filter(
        (id) => !newScheduledIds.includes(id),
      ),
    },
  });

  // 7. Create new full cus product
  const newProductFree = isFreeProduct(attachParams.prices);
  await createFullCusProduct({
    db: req.db,
    attachParams: attachToInsertParams(attachParams, product),
    startsAt: latestPeriodEnd * 1000,
    subscriptionScheduleIds: newScheduledIds,
    nextResetAt: latestPeriodEnd * 1000,
    disableFreeTrial: true,
    isDowngrade: true,
    scenario: newProductFree ? AttachScenario.Cancel : AttachScenario.Downgrade,
    logger,
  });

  // 8. Updating current cus product canceled_at...
  await CusProductService.update({
    db: req.db,
    cusProductId: curCusProduct.id,
    updates: {
      canceled_at: latestPeriodEnd * 1000,
    },
  });

  let apiVersion = attachParams.apiVersion || APIVersion.v1;
  if (apiVersion >= APIVersion.v1_1) {
    res.status(200).json(
      AttachResultSchema.parse({
        code: SuccessCode.DowngradeScheduled,
        message: `Successfully downgraded from ${curCusProduct.product.name} to ${product.name}`,
        product_ids: [product.id],
        customer_id:
          attachParams.customer.id || attachParams.customer.internal_id,
      }),
    );
  } else {
    res.status(200).json({
      success: true,
    });
  }
};
