import RecaseError from "@/utils/errorUtils.js";

import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import {
  attachToInvoiceResponse,
  insertInvoiceFromAttach,
} from "@/internal/invoices/invoiceUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  APIVersion,
  AttachBranch,
  AttachConfig,
  AttachScenario,
  ErrCode,
  SuccessCode,
} from "@autumn/shared";
import Stripe from "stripe";
import {
  getEarliestPeriodEnd,
  subToPeriodStartEnd,
} from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { createStripeSub2 } from "./createStripeSub2.js";
import { getSmallestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";

import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import { getCustomerSub } from "../../attachUtils/convertAttachParams.js";
import { paramsToSubItems } from "../../mergeUtils/paramsToSubItems.js";
import { updateStripeSub2 } from "../upgradeFlow/updateStripeSub2.js";
import { subToNewSchedule } from "../../mergeUtils/subToNewSchedule.js";
import { isTrialing } from "@autumn/shared";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { addIntervalToAnchor } from "@/internal/products/prices/billingIntervalUtils2.js";

export const handlePaidProduct = async ({
  req,
  res,
  attachParams,
  config,
}: {
  req: ExtendedRequest;
  res: any;
  attachParams: AttachParams;
  config: AttachConfig;
}) => {
  const logger = req.logtail;

  let {
    org,
    customer,
    products,

    invoiceOnly,

    stripeCli,
  } = attachParams;

  if (config.disableTrial) {
    attachParams.freeTrial = null;
  }

  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  let subscriptions: Stripe.Subscription[] = [];

  const { sub: mergeSub, cusProduct: mergeCusProduct } = await getCustomerSub({
    attachParams,
  });

  let sub: Stripe.Subscription | null = null;
  let schedule: Stripe.SubscriptionSchedule | null = null;
  let trialEndsAt = undefined;

  // 1. If merge sub
  if (mergeSub && !config.disableMerge) {
    if (mergeCusProduct?.free_trial) {
      trialEndsAt = isTrialing({
        cusProduct: mergeCusProduct,
        now: attachParams.now,
      })
        ? mergeCusProduct.trial_ends_at
        : undefined;
    }

    attachParams.freeTrial = null;

    // 1. If merged sub is canceled, also add to current schedule
    const newItemSet = await paramsToSubItems({
      req,
      sub: mergeSub,
      attachParams,
      config,
    });

    const { updatedSub } = await updateStripeSub2({
      req,
      attachParams,
      curSub: mergeSub,
      itemSet: newItemSet,
      config,
      fromCreate: true,
    });

    sub = updatedSub;

    if (mergeSub.cancel_at) {
      logger.info("ADD PRODUCT FLOW,CREATING NEW SCHEDULE");
      schedule = await subToNewSchedule({
        req,
        sub: mergeSub,
        attachParams,
        config,
        endOfBillingPeriod: mergeSub.cancel_at,
        removeCusProducts: attachParams.cusProducts.filter((cp) => cp.canceled),
      });
    }

    // 1.
  } else {
    let billingCycleAnchorUnix = undefined;
    const smallestInterval = getSmallestInterval({
      prices: attachParams.prices,
    });

    // 1. If anchor to start of month, get next month anchor
    if (org.config.anchor_start_of_month) {
      billingCycleAnchorUnix = getNextStartOfMonthUnix({
        interval: smallestInterval!.interval,
        intervalCount: smallestInterval!.intervalCount,
      });
    }

    // 2. If merge sub anchor, use it
    if (mergeSub && !config.disableMerge) {
      billingCycleAnchorUnix = addIntervalToAnchor({
        anchorUnix: mergeSub.billing_cycle_anchor * 1000,
        intervalConfig: smallestInterval!,
        now: attachParams.now,
      });
    }

    // 3. If billing cycle anchor, just use it
    if (attachParams.billingAnchor) {
      billingCycleAnchorUnix = attachParams.billingAnchor;
    }

    try {
      sub = await createStripeSub2({
        db: req.db,
        stripeCli,
        attachParams,
        itemSet,
        billingCycleAnchorUnix,
        config,
        logger,
      });
    } catch (error: any) {
      if (
        error instanceof RecaseError &&
        !invoiceOnly &&
        error.code == ErrCode.CreateStripeSubscriptionFailed
      ) {
        return await handleCreateCheckout({
          req,
          res,
          attachParams,
          config,
        });
      }

      throw error;
    }
  }

  subscriptions.push(sub);

  let invoice: Stripe.Invoice | undefined;
  if (sub?.latest_invoice) {
    invoice = await insertInvoiceFromAttach({
      db: req.db,
      stripeInvoice: sub.latest_invoice as Stripe.Invoice,
      attachParams,
      logger,
    });
  }

  const anchorToUnix = getEarliestPeriodEnd({ sub }) * 1000;

  if (config.invoiceCheckout) {
    return {
      invoices: subscriptions.map((s) => s.latest_invoice as Stripe.Invoice),
      subs: subscriptions,
      anchorToUnix,
      config,
    };
  }

  // Add product and entitlements to customer
  const batchInsert = [];

  for (const product of products) {
    batchInsert.push(
      createFullCusProduct({
        db: req.db,
        attachParams: attachToInsertParams(attachParams, product),
        subscriptionIds: subscriptions.map((s) => s.id),
        subscriptionScheduleIds: schedule ? [schedule.id] : undefined,
        anchorToUnix,
        carryExistingUsages: config.carryUsage,
        scenario: AttachScenario.New,
        trialEndsAt: trialEndsAt || undefined,
        logger,
      })
    );
  }
  await Promise.all(batchInsert);

  if (res) {
    let apiVersion = attachParams.apiVersion || APIVersion.v1;
    const productNames = products.map((p) => p.name).join(", ");
    const customerName = customer.name || customer.email || customer.id;
    if (apiVersion >= APIVersion.v1_1) {
      res.status(200).json(
        AttachResultSchema.parse({
          message: `Successfully created subscriptions and attached ${productNames} to ${customerName}`,
          code: SuccessCode.NewProductAttached,
          product_ids: products.map((p) => p.id),
          customer_id: customer.id || customer.internal_id,
          invoice: invoiceOnly
            ? attachToInvoiceResponse({ invoice })
            : undefined,
        })
      );
    } else {
      res.status(200).json({
        success: true,
        message: `Successfully created subscriptions and attached ${products
          .map((p) => p.name)
          .join(", ")} to ${customer.name}`,
        invoice: invoiceOnly ? invoice : undefined,
      });
    }
  }
};
