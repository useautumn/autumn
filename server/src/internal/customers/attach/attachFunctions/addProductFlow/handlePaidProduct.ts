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
  AttachConfig,
  AttachScenario,
  BillingInterval,
  ErrCode,
  SuccessCode,
} from "@autumn/shared";
import Stripe from "stripe";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import {
  getEarliestPeriodEnd,
  getLatestPeriodEnd,
  subToPeriodStartEnd,
} from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { createStripeSub2 } from "./createStripeSub2.js";
import { addBillingIntervalUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { getSmallestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import { getCustomerSub } from "../../attachUtils/convertAttachParams.js";
import { paramsToSubItems } from "../../mergeUtils/paramsToSubItems.js";
import { updateStripeSub2 } from "../upgradeFlow/updateStripeSub2.js";
import { paramsToScheduleItems } from "../../mergeUtils/paramsToScheduleItems.js";
import { createSubSchedule } from "../scheduleFlow/createSubSchedule.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { subToNewSchedule } from "../../mergeUtils/subToNewSchedule.js";

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

  if (config.disableTrial) {
    attachParams.freeTrial = null;
  }

  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  let subscriptions: Stripe.Subscription[] = [];

  // Only merge if no free trials
  let mergeCusProduct = undefined;
  if (!config.disableMerge && !freeTrial) {
    mergeCusProduct = cusProducts?.find((cp) =>
      products.some((p) => p.group == cp.product.group)
    );
  }

  // let mergeSub = await cusProductToSub({
  //   cusProduct: mergeCusProduct!,
  //   stripeCli,
  // });

  const mergeSub = await getCustomerSub({ attachParams });
  let sub: Stripe.Subscription | null = null;
  let schedule: Stripe.SubscriptionSchedule | null = null;

  // 1. If merge sub
  if (mergeSub) {
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
      schedule = await subToNewSchedule({
        req,
        sub: mergeSub,
        attachParams,
        config,
        endOfBillingPeriod: mergeSub.cancel_at,
      });
    }

    // 1.
  } else {
    // 2. If merge sub interval
    let billingCycleAnchorUnix = undefined;
    if (attachParams.billingAnchor) {
      billingCycleAnchorUnix = attachParams.billingAnchor;
    }

    const earliestInterval = getSmallestInterval({
      prices: attachParams.prices,
    });

    if (mergeSub) {
      const { end } = subToPeriodStartEnd({ sub: mergeSub });
      billingCycleAnchorUnix = end * 1000;
    }

    try {
      sub = await createStripeSub2({
        db: req.db,
        stripeCli,
        attachParams,
        itemSet,
        anchorToUnix: billingCycleAnchorUnix,
        earliestInterval,
        config,
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

// for (let i = 0; i < itemSets.length; i++) {
//   const itemSet = itemSets[i];
//   if (itemSet.interval === BillingInterval.OneOff) {
//     continue;
//   }

//   let mergeWithSub = mergeSubs.find((sub) => {
//     let subInterval = subToAutumnInterval(sub);
//     return !intervalsDifferent({
//       intervalA: {
//         interval: subInterval.interval,
//         intervalCount: subInterval.intervalCount,
//       },
//       intervalB: {
//         interval: itemSet.interval,
//         intervalCount: itemSet.intervalCount,
//       },
//     });
//   });

//   let subscription;
//   try {
//     let billingCycleAnchorUnix;
//     if (org.config.anchor_start_of_month) {
//       billingCycleAnchorUnix = getNextStartOfMonthUnix({
//         interval: itemSet.interval,
//         intervalCount: itemSet.intervalCount,
//       });
//     }

// if (attachParams.billingAnchor) {
//   billingCycleAnchorUnix = attachParams.billingAnchor;
// }

// if (mergeWithSub) {
//   billingCycleAnchorUnix =
//     mergeWithSub.items.data[0].current_period_end * 1000;
// }

//     subscription = await createStripeSub({
//       db: req.db,
//       stripeCli,
//       customer,
//       org,
//       freeTrial,
//       invoiceOnly,
//       itemSet,
//       finalizeInvoice: config.invoiceCheckout,
//       anchorToUnix: billingCycleAnchorUnix,
//       reward: i == 0 ? reward : undefined,
//       now: attachParams.now,
//     });

//     let sub = subscription as Stripe.Subscription;

//     subscriptions.push(sub);
//   } catch (error: any) {
// if (
//   error instanceof RecaseError &&
//   !invoiceOnly &&
//   error.code == ErrCode.CreateStripeSubscriptionFailed
// ) {
//   return await handleCreateCheckout({
//     req,
//     res,
//     attachParams,
//   });
// }

//     throw error;
//   }
// }

// const batchInsertInvoice: any = [];
// for (const sub of subscriptions) {
//   if (!sub.latest_invoice) continue;
//   batchInsertInvoice.push(
//     insertInvoiceFromAttach({
//       db: req.db,
//       stripeInvoice: sub.latest_invoice as Stripe.Invoice,
//       attachParams,
//       logger,
//     })
//   );
// }
// const invoices = await Promise.all(batchInsertInvoice);
