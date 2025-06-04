import { getStripeExpandedInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import {
  getStripeSchedules,
  getStripeSubs,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";

import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import {
  attachToInsertParams,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  FullCusProduct,
  ErrCode,
  FullProduct,
  CusProductStatus,
  APIVersion,
  UsagePriceConfig,
  AttachScenario,
} from "@autumn/shared";

import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { handleAddProduct } from "../attach/attachFunctions/addProductFlow/handleAddProduct.js";
import {
  AttachParams,
  AttachResultSchema,
} from "../cusProducts/AttachParams.js";
import { CusProductService } from "../cusProducts/CusProductService.js";
import {
  getInvoiceItems,
  insertInvoiceFromAttach,
} from "@/internal/invoices/invoiceUtils.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { updateScheduledSubWithNewItems } from "./scheduleUtils/updateScheduleWithNewItems.js";

// import { billForRemainingUsages } from "./billRemainingUsages.js";
import { updateStripeSubscription } from "@/external/stripe/stripeSubUtils/updateStripeSub.js";
import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";

import {
  addBillingIntervalUnix,
  subtractBillingIntervalUnix,
} from "@/internal/products/prices/billingIntervalUtils.js";

import { differenceInSeconds } from "date-fns";
import { SuccessCode } from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";

export enum ProrationBehavior {
  Immediately = "immediately",
  NextBilling = "next_billing",
  None = "none",
}

// UPGRADE FUNCTIONS
export const handleStripeSubUpdate = async ({
  db,
  stripeCli,
  curCusProduct,
  attachParams,
  disableFreeTrial,
  stripeSubs,
  logger,
  carryExistingUsages = false,
  prorationBehavior = ProrationBehavior.Immediately,
  shouldPreview = false,
}: {
  db: DrizzleCli;
  stripeCli: Stripe;
  curCusProduct: FullCusProduct;
  attachParams: AttachParams;
  disableFreeTrial?: boolean;
  stripeSubs: Stripe.Subscription[];
  logger: any;
  carryExistingUsages?: boolean;
  prorationBehavior?: ProrationBehavior;
  shouldPreview?: boolean;
}) => {
  // HANLDE UPGRADE

  // 1. Get item sets
  const itemSets = await getStripeSubItems({
    attachParams,
    carryExistingUsages,
  });

  const firstSub = stripeSubs[0];
  const firstItemSet = itemSets[0];
  let curPrices = curCusProduct.customer_prices.map((cp) => cp.price);

  // 1. DELETE ITEMS FROM CURRENT SUB THAT CORRESPOND TO OLD PRODUCT
  for (const item of firstSub.items.data) {
    let stripePriceExists = curPrices.some(
      (p) =>
        p.config!.stripe_price_id === item.price.id ||
        (p.config as UsagePriceConfig).stripe_product_id === item.price.product,
    );

    let stripeProdExists =
      item.price.product == curCusProduct.product.processor?.id;

    if (!stripePriceExists && !stripeProdExists) {
      continue;
    }

    firstItemSet.items.push({
      id: item.id,
      deleted: true,
    });
  }

  // 2. Add trial to new subscription?
  let trialEnd;
  if (!disableFreeTrial) {
    trialEnd = freeTrialToStripeTimestamp({
      freeTrial: attachParams.freeTrial,
      now: attachParams.now,
    });
  }

  // 3. Update current subscription
  let newSubs = [];
  const subUpdateRes = await updateStripeSubscription({
    db,
    stripeCli,
    subscriptionId: firstSub.id,
    trialEnd,
    org: attachParams.org,
    customer: attachParams.customer,
    invoiceOnly: attachParams.invoiceOnly || false,
    prorationBehavior,
    logger,
    itemSet: firstItemSet,
    shouldPreview,
  });

  if (shouldPreview) {
    return subUpdateRes;
  }

  let subUpdate = subUpdateRes as Stripe.Subscription;

  newSubs.push(subUpdate);

  // 4. If scheduled_ids exist, need to update schedule too (BRUH)!
  if (curCusProduct.scheduled_ids && curCusProduct.scheduled_ids.length > 0) {
    let schedules = await getStripeSchedules({
      stripeCli,
      scheduleIds: curCusProduct.scheduled_ids,
    });

    for (const scheduleObj of schedules) {
      const { interval, schedule } = scheduleObj;

      // If schedule has passed, skip this step.
      let phase = schedule.phases.length > 0 ? schedule.phases[0] : null;
      let now = Date.now();
      if (schedule.test_clock) {
        let testClock = await stripeCli.testHelpers.testClocks.retrieve(
          schedule.test_clock as string,
        );
        now = testClock.frozen_time * 1000;
      }

      if (phase && phase.start_date * 1000 < now) {
        logger.info("Note: Schedule has passed, skipping");
        continue;
      }

      // Get corresponding item set
      const itemSet = itemSets.find((itemSet) => itemSet.interval === interval);
      if (!itemSet) {
        continue;
      }

      await updateScheduledSubWithNewItems({
        scheduleObj,
        newItems: itemSet.items,
        stripeCli,
        cusProductsForGroup: [curCusProduct],
        itemSet,
        db,
        org: attachParams.org,
        env: attachParams.customer.env,
      });
    }
  }

  // 5. Insert invoice
  await insertInvoiceFromAttach({
    db,
    attachParams,
    invoiceId: subUpdate.latest_invoice as string,
    logger,
  });

  // 2. Create new subscriptions
  let newSubIds = [];
  newSubIds.push(firstSub.id);
  const newItemSets = itemSets.slice(1);
  let invoiceIds = [];

  // CREATE NEW SUBSCRIPTIONS
  for (const itemSet of newItemSets) {
    // 1. Next billing date for first sub
    const nextCycleAnchor = firstSub.current_period_end * 1000;
    let nextCycleAnchorUnix = nextCycleAnchor;
    const naturalBillingDate = addBillingIntervalUnix(
      Date.now(),
      itemSet.interval,
    );

    while (true) {
      const subtractedUnix = subtractBillingIntervalUnix(
        nextCycleAnchorUnix,
        itemSet.interval,
      );

      if (subtractedUnix < Date.now()) {
        break;
      }

      nextCycleAnchorUnix = subtractedUnix;
    }

    let billingCycleAnchorUnix: number | undefined = nextCycleAnchorUnix;
    if (
      differenceInSeconds(
        new Date(naturalBillingDate),
        new Date(nextCycleAnchorUnix),
      ) < 60
    ) {
      billingCycleAnchorUnix = undefined;
    }

    const newSub = (await createStripeSub({
      db,
      stripeCli,
      customer: attachParams.customer,
      org: attachParams.org,
      itemSet,
      invoiceOnly: attachParams.invoiceOnly || false,
      freeTrial: attachParams.freeTrial,
      anchorToUnix: billingCycleAnchorUnix,
    })) as Stripe.Subscription;

    newSubs.push(newSub);
    newSubIds.push(newSub.id);
    invoiceIds.push(newSub.latest_invoice as string);
  }

  // 3. Cancel old subscriptions
  let remainingExistingSubIds = stripeSubs.slice(1).map((sub) => sub.id);

  return {
    subUpdate,
    newSubIds,
    invoiceIds,
    remainingExistingSubIds,
    newSubs,
  };
};

const handleOnlyEntsChanged = async ({
  req,
  res,
  attachParams,
  curCusProduct,
  carryExistingUsages = false,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
  carryExistingUsages?: boolean;
}) => {
  const logger = req.logtail;
  logger.info("Only entitlements changed, no need to update prices");

  // Remove subscription from previous cus product
  await CusProductService.update({
    db: req.db,
    cusProductId: curCusProduct.id,
    updates: {
      subscription_ids: [],
    },
  });

  await createFullCusProduct({
    db: req.db,
    attachParams: attachToInsertParams(attachParams, attachParams.products[0]),
    subscriptionIds: curCusProduct.subscription_ids || [],
    disableFreeTrial: false,
    keepResetIntervals: true,
    carryExistingUsages,
    logger,
  });

  logger.info("✅ Successfully updated entitlements for product");

  let org = attachParams.org;

  let apiVersion = org.api_version || APIVersion.v1;
  if (apiVersion >= APIVersion.v1_1) {
    res.status(200).json(
      AttachResultSchema.parse({
        customer_id: attachParams.customer.id,
        product_ids: attachParams.products.map((p) => p.id),
        code: SuccessCode.FeaturesUpdated,
        message: `Successfully updated features for customer ${attachParams.customer.id} on product ${attachParams.products[0].name}`,
      }),
    );
  } else {
    res.status(200).json({
      success: true,
      message: `Successfully updated entitlements for ${curCusProduct.product.name}`,
    });
  }
};

export const handleUpgrade = async ({
  req,
  res,
  attachParams,
  curCusProduct,
  curFullProduct,
  hasPricesChanged = true,
  fromReq = true,
  carryExistingUsages = false,
  prorationBehavior,
  newVersion = false,
  updateSameProduct = false,
}: {
  req: ExtendedRequest;
  res: any;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
  curFullProduct: FullProduct;
  hasPricesChanged?: boolean;
  fromReq?: boolean;
  carryExistingUsages?: boolean;
  prorationBehavior?: ProrationBehavior;
  newVersion?: boolean;
  updateSameProduct?: boolean;
}) => {
  const logger = req.logtail;
  const { org, customer, products } = attachParams;
  let product = products[0];

  let disableFreeTrial = false;
  if (newVersion) {
    disableFreeTrial = true;
  }

  if (!hasPricesChanged) {
    await handleOnlyEntsChanged({
      req,
      res,
      attachParams,
      curCusProduct,
      carryExistingUsages,
    });
    return;
  }

  logger.info(
    `Upgrading ${curFullProduct.name} to ${product.name} for ${customer.id}`,
  );

  const stripeCli = createStripeCli({ org, env: customer.env });
  const stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids,
  });

  // 1. If current product has trial and new product has trial, cancel and start new subscription
  let trialToTrial =
    curCusProduct.trial_ends_at &&
    curCusProduct.trial_ends_at > Date.now() &&
    attachParams.freeTrial &&
    !disableFreeTrial;

  let trialToPaid =
    curCusProduct.trial_ends_at &&
    curCusProduct.trial_ends_at > Date.now() &&
    !attachParams.freeTrial &&
    !newVersion; // If trial to paid and not migrating, cancel trial and start new sub immediately.

  // 2. If upgrade is free to paid, or paid to free (migration / update)
  let toFreeProduct = isFreeProduct(attachParams.prices);
  let paidToFreeProduct =
    isFreeProduct(curCusProduct.customer_prices.map((cp) => cp.price)) &&
    !isFreeProduct(attachParams.prices);

  if (trialToTrial || trialToPaid || toFreeProduct || paidToFreeProduct) {
    if (trialToTrial) {
      logger.info(
        `Upgrading from trial to trial, cancelling and starting new subscription`,
      );
    } else if (toFreeProduct) {
      logger.info(
        `switching to free product, cancelling (if needed) and adding free product`,
      );
    }

    await handleAddProduct({
      req,
      res,
      attachParams,
      fromRequest: fromReq,
      carryExistingUsages,
      keepResetIntervals: newVersion, // keep reset intervals if upgrading version (migrations)
      disableMerge: true,
    });

    if (notNullish(curCusProduct.subscription_ids)) {
      for (const subId of curCusProduct.subscription_ids!) {
        try {
          await stripeCli.subscriptions.cancel(subId);
        } catch (error) {
          throw new RecaseError({
            message: `Handling upgrade (cur product on trial): failed to cancel subscription ${subId}`,
            code: ErrCode.StripeCancelSubscriptionFailed,
            statusCode: StatusCodes.BAD_REQUEST,
            data: error,
          });
        }
      }
    }
    return;
  }

  logger.info("1. Updating current subscription to new product");
  let {
    subUpdate,
    newSubIds,
    invoiceIds,
    remainingExistingSubIds,
    newSubs,
  }: any = await handleStripeSubUpdate({
    db: req.db,
    curCusProduct,
    stripeCli,
    attachParams,
    disableFreeTrial,
    stripeSubs,
    logger,
    carryExistingUsages,
    prorationBehavior,
  });

  // logger.info("2. Bill for remaining usages");
  // await billForRemainingUsages({
  //   db: req.db,
  //   attachParams,
  //   curCusProduct,
  //   newSubs,
  //   logger,
  // });

  logger.info(
    "2.1. Remove old subscription ID from old cus product and expire",
  );
  await CusProductService.update({
    db: req.db,
    cusProductId: curCusProduct.id,
    updates: {
      subscription_ids: curCusProduct.subscription_ids!.filter(
        (subId) => subId !== subUpdate.id,
      ),
      processor: {
        ...curCusProduct.processor,
        subscription_id: null,
      } as any,
      status: CusProductStatus.Expired,
    },
  });

  if (remainingExistingSubIds && remainingExistingSubIds.length > 0) {
    logger.info("2.2. Canceling old subscriptions");
    for (const subId of remainingExistingSubIds) {
      logger.info("   - Cancelling old subscription", subId);
      await stripeCli.subscriptions.cancel(subId);
    }
  }

  // Handle backend
  logger.info("3. Creating new full cus product");

  await createFullCusProduct({
    db: req.db,
    attachParams: attachToInsertParams(attachParams, products[0]),
    subscriptionIds: newSubIds,

    anchorToUnix:
      newSubs.length > 0 ? newSubs[0].current_period_end * 1000 : undefined,

    disableFreeTrial,
    carryExistingUsages,
    carryOverTrial: true,
    scenario: AttachScenario.Upgrade,
    logger,
  });

  // Create invoices
  logger.info("4. Creating invoices");
  logger.info(`Invoice IDs: ${invoiceIds}`);
  const batchInsertInvoice = [];

  for (const invoiceId of invoiceIds) {
    const insertInvoice = async () => {
      const stripeInvoice = await getStripeExpandedInvoice({
        stripeCli,
        stripeInvoiceId: invoiceId,
      });

      let autumnInvoiceItems = await getInvoiceItems({
        stripeInvoice,
        prices: attachParams.prices,
        logger,
      });

      await InvoiceService.createInvoiceFromStripe({
        db: req.db,
        stripeInvoice,
        internalCustomerId: customer.internal_id,
        internalEntityId: attachParams.internalEntityId,
        org,
        productIds: products.map((p) => p.id),
        internalProductIds: products.map((p) => p.internal_id),
        items: autumnInvoiceItems,
      });
    };
    batchInsertInvoice.push(insertInvoice());
  }

  await Promise.all(batchInsertInvoice);
  logger.info("✅ Done!");

  if (fromReq) {
    if (org.api_version! >= APIVersion.v1_1) {
      res.status(200).json(
        AttachResultSchema.parse({
          customer_id: customer.id,
          product_ids: products.map((p) => p.id),
          code: updateSameProduct
            ? SuccessCode.UpdatedSameProduct
            : newVersion
              ? SuccessCode.UpgradedToNewVersion
              : SuccessCode.UpgradedToNewProduct,
          message: `Successfully attached ${product.name} to ${customer.name} -- upgraded from ${curFullProduct.name}`,
        }),
      );
    } else {
      res.status(200).json({
        success: true,
        message: `Successfully attached ${product.name} to ${customer.name} -- upgraded from ${curFullProduct.name}`,
      });
    }
  }
};
