import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
  attachToInsertParams,
  getPricesForProduct,
  isFreeProduct,
  isProductUpgrade,
} from "@/internal/products/productUtils.js";
import Stripe from "stripe";

import { BillingInterval, ErrCode, FullCusProduct } from "@autumn/shared";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";

import { AttachParams } from "../products/AttachParams.js";
import { handleUpgrade } from "./handleUpgrade.js";
import { differenceInDays } from "date-fns";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { handleDowngrade } from "./handleDowngrade.js";
import { getPricesForCusProduct } from "./scheduleUtils.js";

const scheduleStripeSubscription = async ({
  attachParams,
  stripeCli,
  itemSet,
  endOfBillingPeriod,
}: {
  attachParams: AttachParams;
  stripeCli: Stripe;
  itemSet: any;
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
      prices[index].config!.interval !== BillingInterval.OneOff
  );
  let oneOffItems = items.filter(
    (item: any, index: number) =>
      prices[index].config!.interval === BillingInterval.OneOff
  );

  const newSubscriptionSchedule = await stripeCli.subscriptionSchedules.create({
    customer: customer.processor.id,
    start_date: endOfBillingPeriod,
    phases: [
      {
        items: subItems,
        default_payment_method: paymentMethod as string,
        metadata: itemSet.subMeta,
        add_invoice_items: oneOffItems,
      },
    ],
  });

  return newSubscriptionSchedule.id;
};

const handleDowngradeOld = async ({
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
  let product = attachParams.products[0];

  console.log(
    `Handling downgrade from ${curCusProduct.product.name} to ${product.name}`
  );

  // 1. Cancel current subscription
  console.log("1. Cancelling current subscription (at period end)");

  const stripeCli = createStripeCli({
    org: attachParams.org,
    env: attachParams.customer.env,
  });
  const { customer } = attachParams;

  // 2. Fetch current subscriptions
  const curSubscriptions = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids!,
  });

  let latestPeriodEnd = 0;
  for (const subscription of curSubscriptions) {
    if (subscription.current_period_end > latestPeriodEnd) {
      latestPeriodEnd = subscription.current_period_end;
    }
  }

  for (const curSub of curSubscriptions) {
    // either schedule removal or cancel at period end

    let periodEnd = curSub.current_period_end;
    let latestEndDate = new Date(latestPeriodEnd * 1000);
    let curEndDate = new Date(periodEnd * 1000);

    if (differenceInDays(latestEndDate, curEndDate) > 10) {
      await stripeCli.subscriptions.update(curSub.id, {
        cancel_at: latestPeriodEnd,
      });
    } else {
      await stripeCli.subscriptions.update(curSub.id, {
        cancel_at_period_end: true,
      });
      console.log(`Cancelled subscription ${curSub.id} at period end`);
    }
  }

  // 3. Schedule new subscription IF new product is not free...
  console.log("2. Scheduling new subscriptions");
  let subscriptionScheduleIds: any[] = [];
  if (!isFreeProduct(attachParams.prices)) {
    // await removePreviousScheduledProducts({
    //   sb: req.sb,
    //   stripeCli,
    //   attachParams,
    // });

    // Schedule all the new subscriptions to start at period end
    const itemSets = await getStripeSubItems({
      attachParams,
    });

    for (const itemSet of itemSets) {
      let scheduleId = await scheduleStripeSubscription({
        attachParams,
        stripeCli,
        itemSet,
        endOfBillingPeriod: latestPeriodEnd,
      });
      subscriptionScheduleIds.push(scheduleId);
    }
  }

  // 2. Insert new full cus product with starts_at later than current billing period
  console.log("3. Inserting new full cus product (starts at period end)");
  await createFullCusProduct({
    sb: req.sb,
    attachParams: attachToInsertParams(attachParams, product),
    subscriptionId: undefined,
    startsAt: latestPeriodEnd * 1000,
    subscriptionScheduleIds: subscriptionScheduleIds,
    nextResetAt: latestPeriodEnd * 1000,
    disableFreeTrial: true,
  });

  res.status(200).json({
    success: true,
    message: `Successfully scheduled downgrade to ${product.name} for customer ${attachParams.customer.name}`,
  });
};

export const handleChangeProduct = async ({
  req,
  res,
  attachParams,
  curCusProduct,
  isCustom,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
  isCustom: boolean;
}) => {
  // Get subscription
  const curProduct = curCusProduct.product;
  const { org, customer, products, prices, entitlements, optionsList } =
    attachParams;

  // Can only upgrade once for now
  if (products.length > 1) {
    throw new RecaseError({
      message: `Can't handle upgrade / downgrade for multiple products`,
      code: ErrCode.UpgradeFailed,
      statusCode: StatusCodes.NOT_IMPLEMENTED,
    });
  }

  let product = products[0];

  const curFullProduct = await ProductService.getFullProductStrict({
    sb: req.sb,
    productId: curProduct.id,
    orgId: org.id,
    env: customer.env,
  });

  let curPrices = getPricesForCusProduct({
    cusProduct: curCusProduct!,
  });
  let newPrices = attachParams.prices;

  const isUpgrade =
    isCustom ||
    isProductUpgrade({
      prices1: curPrices,
      prices2: newPrices,
    });

  if (!isUpgrade) {
    await handleDowngrade({
      req,
      res,
      attachParams,
      curCusProduct,
    });
    return;
  } else {
    await handleUpgrade({
      req,
      res,
      attachParams,
      curCusProduct,
      curFullProduct,
    });
  }
};
