import { CusProductService } from "../cusProducts/CusProductService.js";
import Stripe from "stripe";
import {
  AttachParams,
  AttachResultSchema,
} from "../cusProducts/AttachParams.js";
import {
  getStripeSchedules,
  getStripeSubs,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { APIVersion, AttachScenario, FullCusProduct } from "@autumn/shared";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { BillingInterval } from "@autumn/shared";
import { updateScheduledSubWithNewItems } from "./scheduleUtils/updateScheduleWithNewItems.js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import {
  attachToInsertParams,
  isFreeProduct,
} from "@/internal/products/productUtils.js";

import { generateId } from "@/utils/genUtils.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { SubService } from "@/internal/subscriptions/SubService.js";

import { SuccessCode } from "@autumn/shared";
import { cancelCurSubs } from "./handleDowngrade/cancelCurSubs.js";
import { getScheduleIdsFromCusProducts } from "./scheduleUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

const scheduleStripeSubscription = async ({
  db,
  attachParams,
  stripeCli,
  itemSet,
  endOfBillingPeriod,
}: {
  db: DrizzleCli;
  attachParams: AttachParams;
  stripeCli: Stripe;
  itemSet: ItemSet;
  endOfBillingPeriod: number;
}) => {
  const { org, customer } = attachParams;
  const { items, prices, subMeta } = itemSet;

  const paymentMethod = await getCusPaymentMethod({
    org,
    env: customer.env,
    stripeId: customer.processor.id,
  });

  let subItems = items.filter(
    (item: any, index: number) =>
      index >= prices.length ||
      prices[index].config!.interval !== BillingInterval.OneOff,
  );
  let oneOffItems = items.filter(
    (item: any, index: number) =>
      index < prices.length &&
      prices[index].config!.interval === BillingInterval.OneOff,
  );

  const newSubscriptionSchedule = await stripeCli.subscriptionSchedules.create({
    customer: customer.processor.id,
    start_date: endOfBillingPeriod,

    phases: [
      {
        items: subItems,
        default_payment_method: paymentMethod as string,
        // metadata: itemSet.subMeta,
        add_invoice_items: oneOffItems,
      },
    ],
  });

  await SubService.createSub({
    db,
    sub: {
      id: generateId("sub"),
      stripe_id: null,
      stripe_schedule_id: newSubscriptionSchedule.id,
      created_at: Date.now(),
      usage_features: itemSet.usageFeatures,
      org_id: org.id,
      env: customer.env,
      current_period_start: null,
      current_period_end: null,
    },
  });

  return newSubscriptionSchedule.id;
};

export const getCusProductsWithStripeSubIds = async ({
  cusProducts,
  stripeSubId,
  curCusProductId,
}: {
  cusProducts: FullCusProduct[];
  stripeSubId: string;
  curCusProductId?: string;
}) => {
  return cusProducts.filter(
    (cusProduct) =>
      cusProduct.subscription_ids?.includes(stripeSubId) &&
      cusProduct.id !== curCusProductId,
  );
};

export const handleDowngrade = async ({
  req,
  res,
  attachParams,
  curCusProduct,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
}) => {
  const logger = req.logtail;
  let product = attachParams.products[0];
  const stripeCli = createStripeCli({
    org: attachParams.org,
    env: attachParams.customer.env,
  });
  logger.info(
    `Handling downgrade from ${curCusProduct.product.name} to ${product.name}`,
  );

  const curSubscriptions = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids!,
  });

  const latestPeriodEnd = curSubscriptions[0].current_period_end;

  // 1. Cancel all current subscriptions
  logger.info("1. Cancelling current subscription (at period end)");
  const intervalToOtherSubs = await cancelCurSubs({
    curSubs: curSubscriptions,
    stripeCli,
    curCusProduct,
  });

  // 3. Schedule new subscription IF new product is not free...
  logger.info("2. Schedule new subscription");
  let oldScheduledIds: string[] = getScheduleIdsFromCusProducts({
    cusProducts: [curCusProduct, attachParams.curScheduledProduct],
  });

  let schedules: any[] = [];

  if (oldScheduledIds.length > 0) {
    schedules = await getStripeSchedules({
      stripeCli,
      scheduleIds: oldScheduledIds,
    });
  }

  // 4. Create new subscription schedule
  const itemSets: any[] = await getStripeSubItems({
    attachParams,
    isCheckout: false,
  });

  let scheduledIds: string[] = [];

  for (const itemSet of itemSets) {
    let scheduleObj = schedules.find(
      (schedule) => schedule.interval === itemSet.interval,
    );

    if (scheduleObj) {
      await updateScheduledSubWithNewItems({
        scheduleObj,
        newItems: itemSet.items,
        stripeCli,
        cusProducts: [curCusProduct, attachParams.curScheduledProduct],
        itemSet: itemSet,
        db: req.db,
        org: attachParams.org,
        env: attachParams.customer.env,
      });
      scheduledIds.push(scheduleObj.schedule.id);
    } else {
      const otherSubObj = intervalToOtherSubs[itemSet.interval];

      let otherSub = otherSubObj?.otherSub || null;
      let otherSubItems = otherSubObj?.otherSubItems || [];

      let otherCusProducts = otherSub
        ? await getCusProductsWithStripeSubIds({
            cusProducts: attachParams.cusProducts!,
            stripeSubId: otherSub.id,
          })
        : [];

      // If there is other sub items
      itemSet.items.push(
        ...otherSubItems.map((sub: any) => ({
          price: sub.price.id,
          quantity: sub.quantity,
        })),
      );

      let scheduleId = await scheduleStripeSubscription({
        db: req.db,
        attachParams,
        stripeCli,
        itemSet,
        endOfBillingPeriod: latestPeriodEnd,
      });
      scheduledIds.push(scheduleId);

      if (otherCusProducts.length > 0) {
        for (const otherCusProduct of otherCusProducts) {
          let newScheduledIds = [
            ...(otherCusProduct.scheduled_ids || []),
            scheduleId,
          ];
          await CusProductService.update({
            db: req.db,
            cusProductId: otherCusProduct.id,
            updates: { scheduled_ids: newScheduledIds },
          });
        }
      }
    }
  }

  // Remove scheduled ids from curCusProduct
  await CusProductService.update({
    db: req.db,
    cusProductId: curCusProduct.id,
    updates: {
      scheduled_ids: curCusProduct.scheduled_ids?.filter(
        (id) => !scheduledIds.includes(id),
      ),
    },
  });

  // 4. Update cus product
  logger.info("3. Inserting new full cus product (starts at period end)");
  const newProductFree = isFreeProduct(attachParams.prices);
  await createFullCusProduct({
    db: req.db,
    attachParams: attachToInsertParams(attachParams, product),
    startsAt: latestPeriodEnd * 1000,
    subscriptionScheduleIds: scheduledIds,
    nextResetAt: latestPeriodEnd * 1000,
    disableFreeTrial: true,
    isDowngrade: true,
    scenario: newProductFree ? AttachScenario.Cancel : AttachScenario.Downgrade,
  });

  // 5. Updating current cus product canceled_at...
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
