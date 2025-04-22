import { getStripeExpandedInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
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
} from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { handleAddProduct } from "../add-product/handleAddProduct.js";
import { InvoiceService } from "../invoices/InvoiceService.js";
import { AttachParams, AttachResultSchema } from "../products/AttachParams.js";
import { CusProductService } from "../products/CusProductService.js";
import { attachParamsToInvoice } from "../invoices/invoiceUtils.js";
import { updateScheduledSubWithNewItems } from "./scheduleUtils.js";
import { billForRemainingUsages } from "./billRemainingUsages.js";
import { updateStripeSubscription } from "@/external/stripe/stripeSubUtils/updateStripeSub.js";
import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";

import {
  addBillingIntervalUnix,
  subtractBillingIntervalUnix,
} from "@/internal/prices/billingIntervalUtils.js";

import { differenceInSeconds } from "date-fns";
import { SuccessCode } from "@autumn/shared";

export enum ProrationBehavior {
  Immediately = "immediately",
  NextBilling = "next_billing",
  None = "none",
}

// UPGRADE FUNCTIONS
const handleStripeSubUpdate = async ({
  sb,
  stripeCli,
  curCusProduct,
  attachParams,
  disableFreeTrial,
  stripeSubs,
  logger,
  carryExistingUsages = false,
  prorationBehavior = ProrationBehavior.Immediately,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  curCusProduct: FullCusProduct;
  attachParams: AttachParams;
  disableFreeTrial?: boolean;
  stripeSubs: Stripe.Subscription[];
  logger: any;
  carryExistingUsages?: boolean;
  prorationBehavior?: ProrationBehavior;
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
      (p) => p.config!.stripe_price_id === item.price.id
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
    trialEnd = freeTrialToStripeTimestamp(attachParams.freeTrial);
  }

  // 3. Update current subscription
  let newSubs = [];
  const subUpdate: Stripe.Subscription = await updateStripeSubscription({
    sb,
    stripeCli,
    subscriptionId: firstSub.id,
    trialEnd,
    org: attachParams.org,
    customer: attachParams.customer,
    invoiceOnly: attachParams.invoiceOnly || false,
    prorationBehavior,
    logger,

    itemSet: firstItemSet,
  });

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
          schedule.test_clock as string
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
        cusProducts: [curCusProduct, attachParams.curScheduledProduct],
        itemSet,
        sb,
        org: attachParams.org,
        env: attachParams.customer.env,
      });
    }
  }

  // what's happening here...
  await attachParamsToInvoice({
    sb,
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
      itemSet.interval
    );

    while (true) {
      const subtractedUnix = subtractBillingIntervalUnix(
        nextCycleAnchorUnix,
        itemSet.interval
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
        new Date(nextCycleAnchorUnix)
      ) < 60
    ) {
      billingCycleAnchorUnix = undefined;
    }

    const newSub = await createStripeSub({
      sb,
      stripeCli,
      customer: attachParams.customer,
      org: attachParams.org,
      itemSet,
      invoiceOnly: attachParams.invoiceOnly || false,
      freeTrial: attachParams.freeTrial,
      billingCycleAnchorUnix,
    });

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
    sb: req.sb,
    cusProductId: curCusProduct.id,
    updates: {
      subscription_ids: [],
    },
  });

  await createFullCusProduct({
    sb: req.sb,
    attachParams: attachToInsertParams(attachParams, attachParams.products[0]),
    subscriptionIds: curCusProduct.subscription_ids || [],
    disableFreeTrial: false,
    keepResetIntervals: true,
    carryExistingUsages,
  });

  logger.info("✅ Successfully updated entitlements for product");

  let org = attachParams.org;

  if (org.api_version == APIVersion.v1_1) {
    res.status(200).json(
      AttachResultSchema.parse({
        customer_id: attachParams.customer.id,
        product_ids: attachParams.products.map((p) => p.id),
        code: SuccessCode.FeaturesUpdated,
        message: `Successfully updated features for customer ${attachParams.customer.id} on product ${attachParams.products[0].name}`,
      })
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
  req: any;
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
    `Upgrading ${curFullProduct.name} to ${product.name} for ${customer.id}`
  );

  const stripeCli = createStripeCli({ org, env: customer.env });
  const stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids!,
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
    !newVersion; // Only carry over trial if migrating from one version to another...

  // 2. If upgrade is free to paid, or paid to free (migration / update)
  let toFreeProduct = isFreeProduct(attachParams.prices);
  let paidToFreeProduct =
    isFreeProduct(curCusProduct.customer_prices.map((cp) => cp.price)) &&
    !isFreeProduct(attachParams.prices);

  if (trialToTrial || trialToPaid || toFreeProduct || paidToFreeProduct) {
    logger.info(
      "Upgrading from trial to trial, cancelling and starting new subscription"
    );

    await handleAddProduct({
      req,
      res,
      attachParams,
      fromRequest: fromReq,
      carryExistingUsages,
      keepResetIntervals: newVersion, // keep reset intervals if upgrading version (migrations)
    });

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
    return;
  }

  logger.info("1. Updating current subscription to new product");
  let { subUpdate, newSubIds, invoiceIds, remainingExistingSubIds, newSubs } =
    await handleStripeSubUpdate({
      sb: req.sb,
      curCusProduct,
      stripeCli,
      attachParams,
      disableFreeTrial,
      stripeSubs,
      logger,
      carryExistingUsages,
      prorationBehavior,
    });

  logger.info("2. Bill for remaining usages");
  await billForRemainingUsages({
    sb: req.sb,
    attachParams,
    curCusProduct,
    newSubs,
    logger,
  });

  logger.info(
    "2.1. Remove old subscription ID from old cus product and expire"
  );
  await CusProductService.update({
    sb: req.sb,
    cusProductId: curCusProduct.id,
    updates: {
      subscription_ids: curCusProduct.subscription_ids!.filter(
        (subId) => subId !== subUpdate.id
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
    sb: req.sb,
    attachParams: attachToInsertParams(attachParams, products[0]),
    subscriptionIds: newSubIds,
    keepResetIntervals: true,
    disableFreeTrial,
    carryExistingUsages,
    carryOverTrial: true,

    // nextResetAt: subUpdate.current_period_end
    //   ? subUpdate.current_period_end * 1000
    //   : undefined,
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

      await InvoiceService.createInvoiceFromStripe({
        sb: req.sb,
        stripeInvoice,
        internalCustomerId: customer.internal_id,
        org,
        productIds: products.map((p) => p.id),
        internalProductIds: products.map((p) => p.internal_id),
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
        })
      );
    } else {
      res.status(200).json({
        success: true,
        message: `Successfully attached ${product.name} to ${customer.name} -- upgraded from ${curFullProduct.name}`,
      });
    }
  }
};
