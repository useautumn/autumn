import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  AppEnv,
  CusProductStatus,
  FullCusProduct,
  Organization,
} from "@autumn/shared";

import { createStripeCli } from "../utils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { cancelFutureProductSchedule } from "@/internal/customers/change-product/scheduleUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getExistingCusProducts } from "@/internal/customers/add-product/handleExistingProduct.js";

export const handleSubscriptionUpdated = async ({
  sb,
  org,
  subscription,
  previousAttributes,
  env,
  logger,
}: {
  sb: any;
  org: Organization;
  env: AppEnv;
  subscription: any;
  previousAttributes: any;
  logger: any;
}) => {
  let subStatusMap: {
    [key: string]: CusProductStatus;
  } = {
    trialing: CusProductStatus.Active,
    active: CusProductStatus.Active,
    past_due: CusProductStatus.PastDue,
  };

  // Get cus products by stripe sub id

  const cusProducts = await CusProductService.getByStripeSubId({
    sb,
    stripeSubId: subscription.id,
    orgId: org.id,
    env,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
  });

  if (cusProducts.length === 0) {
    console.log(
      `subscription.updated: no customer products found with stripe sub id: ${subscription.id}`
    );
    return;
  }

  // 1. Fetch subscription
  const updatedCusProducts = await CusProductService.updateByStripeSubId({
    sb,
    stripeSubId: subscription.id,
    updates: {
      status: subStatusMap[subscription.status] || CusProductStatus.Unknown,
      canceled_at: subscription.canceled_at
        ? subscription.canceled_at * 1000
        : null,
      collection_method: subscription.collection_method,
    },
  });

  if (updatedCusProducts.length > 0) {
    console.log(
      `subscription.updated: updated ${updatedCusProducts.length} customer products`,
      {
        ids: updatedCusProducts.map((cp) => cp.id),
        status: updatedCusProducts[0].status,
        canceled_at: updatedCusProducts[0].canceled_at,
      }
    );
  }

  // Handle if canceled
  let isCanceled =
    nullish(previousAttributes?.canceled_at) &&
    !nullish(subscription.canceled_at);

  if (isCanceled && updatedCusProducts.length > 0) {
    let allDefaultProducts = await ProductService.getFullDefaultProducts({
      sb,
      orgId: org.id,
      env,
    });

    let cusProducts = await CusService.getFullCusProducts({
      sb,
      internalCustomerId: updatedCusProducts[0].customer.internal_id,
      withProduct: true,
      withPrices: true,
      inStatuses: [CusProductStatus.Scheduled],
    });

    let defaultProducts = allDefaultProducts.filter((p) =>
      cusProducts.some((cp: FullCusProduct) => cp.product.group == p.group)
    );

    let customer = updatedCusProducts[0].customer;

    if (defaultProducts.length > 0) {
      console.log(
        `subscription.updated: canceled -> attempting to schedule default products: ${defaultProducts
          .map((p) => p.name)
          .join(", ")}`
      );
    }

    for (let product of defaultProducts) {
      let alreadyScheduled = cusProducts.some(
        (cp: FullCusProduct) => cp.product.id == product.id
      );

      if (alreadyScheduled) {
        continue;
      }

      await createFullCusProduct({
        sb,
        attachParams: {
          customer,
          product,
          prices: product.prices,
          entitlements: product.entitlements,
          freeTrial: product.free_trial || null,
          optionsList: [],
          entities: [],
          org,
        },
        startsAt: subscription.current_period_end * 1000,
      });
    }
  }

  let uncanceled =
    notNullish(previousAttributes?.canceled_at) &&
    nullish(subscription.canceled_at);

  if (uncanceled && updatedCusProducts.length > 0) {
    let customer = updatedCusProducts[0].customer;
    let allCusProducts = await CusService.getFullCusProducts({
      sb,
      internalCustomerId: customer.internal_id,
      withProduct: true,
      withPrices: true,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
    });

    let { curScheduledProduct } = await getExistingCusProducts({
      product: updatedCusProducts[0].product,
      cusProducts: allCusProducts,
    });

    if (curScheduledProduct) {
      console.log("subscription.updated: uncanceled -> removing scheduled");
      let stripeCli = createStripeCli({
        org,
        env,
      });
      await cancelFutureProductSchedule({
        sb,
        org,
        stripeCli,
        cusProducts: allCusProducts,
        product: updatedCusProducts[0].product,
        logger,
        env,
      });

      await CusProductService.delete({
        sb,
        cusProductId: curScheduledProduct.id,
      });
    }
  }

  // Cancel subscription immediately
  if (subscription.status === "past_due" && org.config.cancel_on_past_due) {
    const stripeCli = createStripeCli({
      org,
      env,
    });

    console.log("subscription.updated: past due, cancelling:", subscription.id);
    try {
      await stripeCli.subscriptions.cancel(subscription.id);
      await stripeCli.invoices.voidInvoice(subscription.latest_invoice);
    } catch (error: any) {
      logger.error(
        `subscription.updated: error cancelling / voiding: ${error.message}`,
        {
          subscriptionId: subscription.id,
          stripeSubId: subscription.id,
          error: error.message,
        }
      );
    }
  }
};

// const handleSubPastDue = async ({
//   sb,
//   org,
//   subscription,
// }: {
//   sb: any;
//   org: Organization;
//   subscription: any;
// }) => {
//   const updated = await CusProductService.updateStatusByStripeSubId({
//     sb,
//     stripeSubId: subscription.id,
//     status: CusProductStatus.PastDue,
//   });

//   if (updated) {
//     console.log("Customer product status updated to past due:", updated?.id);
//   }
// };

// const handleSubActive = async ({
//   sb,
//   org,
//   subscription,
// }: {
//   sb: any;
//   org: Organization;
//   subscription: any;
// }) => {
//   const updated = await CusProductService.updateStatusByStripeSubId({
//     sb,
//     stripeSubId: subscription.id,
//     status: CusProductStatus.Active,
//   });

//   if (updated) {
//     console.log("Customer product status updated to active:", updated?.id);
//   }
// };

// const undoStripeSubCancellation = async ({
//   sb,
//   org,
//   subscription,
// }: {
//   sb: any;
//   org: Organization;
//   subscription: any;
// }) => {
//   const { data: updated, error } = await sb
//     .from("customer_products")
//     .update({
//       canceled_at: null,
//       expires_at: null,
//     })
//     .eq("processor->>subscription_id", subscription.id)
//     .select();

//   if (!updated || updated.length === 0) {
//     return;
//   }

//   console.log("Stripe subscription cancelled undone:", subscription.id);
// };
