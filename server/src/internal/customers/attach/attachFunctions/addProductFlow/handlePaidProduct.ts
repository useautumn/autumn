import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { formatUnixToDateTime } from "@/utils/genUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  APIVersion,
  AttachConfig,
  AttachScenario,
  BillingInterval,
  ErrCode,
  intervalsDifferent,
  SuccessCode,
} from "@autumn/shared";
import Stripe from "stripe";

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
    freeTrial,
    invoiceOnly,
    cusProducts,
    stripeCli,
    reward,
  } = attachParams;

  if (attachParams.disableFreeTrial) {
    freeTrial = null;
  }

  let itemSets = await getStripeSubItems({
    attachParams,
    carryExistingUsages: config.carryUsage,
  });

  let subscriptions: Stripe.Subscription[] = [];

  // Only merge if no free trials
  let mergeCusProduct = undefined;
  if (!config.disableMerge && !freeTrial) {
    mergeCusProduct = cusProducts?.find((cp) =>
      products.some((p) => p.group == cp.product.group)
    );
  }

  let mergeSubs = await getStripeSubs({
    stripeCli,
    subIds: mergeCusProduct?.subscription_ids,
  });

  for (let i = 0; i < itemSets.length; i++) {
    const itemSet = itemSets[i];
    if (itemSet.interval === BillingInterval.OneOff) {
      continue;
    }

    let mergeWithSub = mergeSubs.find((sub) => {
      let subInterval = subToAutumnInterval(sub);
      return !intervalsDifferent({
        intervalA: {
          interval: subInterval.interval,
          intervalCount: subInterval.intervalCount,
        },
        intervalB: {
          interval: itemSet.interval,
          intervalCount: itemSet.intervalCount,
        },
      });
    });

    let subscription;
    try {
      let billingCycleAnchorUnix;
      if (org.config.anchor_start_of_month) {
        billingCycleAnchorUnix = getNextStartOfMonthUnix({
          interval: itemSet.interval,
          intervalCount: itemSet.intervalCount,
        });
      }

      if (attachParams.billingAnchor) {
        billingCycleAnchorUnix = attachParams.billingAnchor;
      }

      if (mergeWithSub) {
        billingCycleAnchorUnix = mergeWithSub.current_period_end * 1000;
      }

      subscription = await createStripeSub({
        db: req.db,
        stripeCli,
        customer,
        org,
        freeTrial,
        invoiceOnly,
        itemSet,
        anchorToUnix: billingCycleAnchorUnix,
        reward: i == 0 ? reward : undefined,
        now: attachParams.now,
      });

      let sub = subscription as Stripe.Subscription;

      subscriptions.push(sub);
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
        });
      }

      throw error;
    }
  }

  // Add product and entitlements to customer
  const batchInsert = [];

  const anchorToUnix =
    subscriptions.length > 0
      ? subscriptions[0].current_period_end * 1000
      : mergeSubs.length > 0
        ? mergeSubs[0].current_period_end * 1000
        : undefined;

  for (const product of products) {
    batchInsert.push(
      createFullCusProduct({
        db: req.db,
        attachParams: attachToInsertParams(attachParams, product),
        subscriptionIds: subscriptions.map((s) => s.id),
        anchorToUnix,
        carryExistingUsages: config.carryUsage,
        scenario: AttachScenario.New,
        logger,
      })
    );
  }
  await Promise.all(batchInsert);

  const batchInsertInvoice: any = [];
  for (const sub of subscriptions) {
    batchInsertInvoice.push(
      insertInvoiceFromAttach({
        db: req.db,
        invoiceId: sub.latest_invoice as string,
        attachParams,
        logger,
      })
    );
  }
  const invoices = await Promise.all(batchInsertInvoice);

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
          invoice: invoiceOnly ? invoices?.[0] : undefined,
        })
      );
    } else {
      res.status(200).json({
        success: true,
        message: `Successfully created subscriptions and attached ${products
          .map((p) => p.name)
          .join(", ")} to ${customer.name}`,
        invoice: invoiceOnly ? invoices?.[0] : undefined,
      });
    }
  }
};
