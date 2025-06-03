import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
  activateDefaultProduct,
  activateFutureProduct,
  cancelCusProductSubscriptions,
} from "@/internal/customers/cusProducts/cusProductUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  AttachScenario,
  BillingType,
  CusProductStatus,
  ErrCode,
  FullCusProduct,
  FullCustomerPrice,
  Organization,
} from "@autumn/shared";

import Stripe from "stripe";

import { subIsPrematurelyCanceled } from "../stripeSubUtils.js";

import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { billForRemainingUsages } from "@/internal/customers/change-product/billRemainingUsages.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getCusPaymentMethod } from "../stripeCusUtils.js";
import { createStripeCli } from "../utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { webhookToAttachParams } from "../webhookUtils/webhookUtils.js";

const handleCusProductDeleted = async ({
  req,
  db,
  stripeCli,
  cusProduct,
  subscription,
  logger,
  prematurelyCanceled,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  stripeCli: Stripe;
  cusProduct: FullCusProduct;
  subscription: Stripe.Subscription;
  logger: any;
  prematurelyCanceled: boolean;
}) => {
  const { org, env } = req;
  const paymentMethod = await getCusPaymentMethod({
    stripeCli,
    stripeId: cusProduct.customer!.processor?.id,
  });

  const customer = cusProduct.customer!;

  if (cusProduct.internal_entity_id) {
    let usagePrices = cusProduct.customer_prices.filter(
      (cp: FullCustomerPrice) =>
        getBillingType(cp.price.config!) === BillingType.UsageInArrear,
    );

    if (usagePrices.length > 0) {
      logger.info(
        `Customer ${customer!.name} (${customer!.id}), Entity: ${cusProduct.internal_entity_id}`,
      );
      logger.info(
        `Product ${cusProduct.product.name} subscription deleted, billing for remaining usages`,
      );
      await billForRemainingUsages({
        db,
        curCusProduct: cusProduct,
        logger,
        attachParams: webhookToAttachParams({
          req,
          stripeCli,
          paymentMethod,
          cusProduct,
        }),
        newSubs: [subscription],
      });
    }
  }

  if (cusProduct.status === CusProductStatus.Expired) {
    return;
  }

  if (
    cusProduct.scheduled_ids &&
    cusProduct.scheduled_ids.length > 0 &&
    !prematurelyCanceled
  ) {
    console.log(
      `   ⚠️ Cus product ${cusProduct.product.name} (${cusProduct.id}) has scheduled_ids and not prematurely canceled: removing subscription_id from cus product`,
    );

    // Remove subscription_id from cus product
    await CusProductService.update({
      db,
      cusProductId: cusProduct.id,
      updates: {
        subscription_ids: cusProduct.subscription_ids?.filter(
          (id) => id !== subscription.id,
        ),
      },
    });

    return;
  }

  // 1. Expire current product
  await CusProductService.update({
    db,
    cusProductId: cusProduct.id,
    updates: {
      status: CusProductStatus.Expired,
      ended_at: subscription.ended_at ? subscription.ended_at * 1000 : null,
    },
  });

  await addProductsUpdatedWebhookTask({
    req,
    internalCustomerId: cusProduct.internal_customer_id,
    org,
    env,
    customerId: null,
    scenario: AttachScenario.Expired,
    cusProduct,
    logger,
  });

  if (cusProduct.product.is_add_on) {
    return;
  }

  const activatedFuture = await activateFutureProduct({
    req,
    db,
    cusProduct,
    subscription,
    org,
    env,
    logger,
  });

  if (activatedFuture) {
    console.log("   ✅ activated future product");
    return;
  }

  // Double check customer's current cus product...
  let cusProducts = await CusProductService.list({
    db,
    internalCustomerId: cusProduct.customer!.internal_id,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
  });

  let { curMainProduct } = getExistingCusProducts({
    product: cusProduct.product,
    cusProducts,
  });

  await activateDefaultProduct({
    db,
    productGroup: cusProduct.product.group,
    customer: cusProduct.customer!,
    org,
    env,
    curCusProduct: curMainProduct || undefined,
    logger,
  });

  await cancelCusProductSubscriptions({
    cusProduct,
    org,
    env,
    excludeIds: [subscription.id],
  });
};

export const handleSubscriptionDeleted = async ({
  req,
  db,
  subscription,
  org,
  env,
  logger,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  subscription: Stripe.Subscription;
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  console.log("Handling subscription.deleted: ", subscription.id);
  const activeCusProducts = await CusProductService.getByStripeSubId({
    db,
    stripeSubId: subscription.id,
    orgId: org.id,
    env,
  });

  const stripeCli = createStripeCli({
    org,
    env,
  });

  if (activeCusProducts.length === 0) {
    if (subscription.livemode) {
      logger.warn(
        `subscription.deleted: ${subscription.id} - no customer products found`,
      );
      return;
    }
  }

  if (subscription.cancellation_details?.comment === "autumn_upgrade") {
    logger.info(
      `sub.deleted: ${subscription.id} from autumn upgrade, skipping`,
    );
    return;
  }

  // Prematurely canceled if cancel_at_period_end is false or cancel_at is more than 20 seconds apart from current_period_end
  let prematurelyCanceled = subIsPrematurelyCanceled(subscription);

  const batchUpdate = [];
  for (const cusProduct of activeCusProducts) {
    batchUpdate.push(
      handleCusProductDeleted({
        req,
        db,
        stripeCli,
        cusProduct,
        subscription,
        logger,
        prematurelyCanceled,
      }),
    );
  }

  await Promise.all(batchUpdate);
};
