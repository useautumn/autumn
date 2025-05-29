import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  activateDefaultProduct,
  activateFutureProduct,
  cancelCusProductSubscriptions,
} from "@/internal/customers/products/cusProductUtils.js";

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
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { subIsPrematurelyCanceled } from "../stripeSubUtils.js";

import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { billForRemainingUsages } from "@/internal/customers/change-product/billRemainingUsages.js";
import { addProductsUpdatedWebhookTask } from "@/external/svix/handleProductsUpdatedWebhook.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getExistingCusProducts } from "@/internal/customers/add-product/handleExistingProduct.js";
import { ExtendedRequest } from "@/utils/models/Request.js";

const handleCusProductDeleted = async ({
  req,
  db,
  cusProduct,
  subscription,
  logger,
  env,
  org,
  prematurelyCanceled,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  cusProduct: FullCusProduct;
  subscription: Stripe.Subscription;
  logger: any;
  env: AppEnv;
  org: Organization;
  prematurelyCanceled: boolean;
}) => {
  if (
    !cusProduct ||
    cusProduct.customer!.env !== env ||
    cusProduct.customer!.org_id !== org.id
  ) {
    console.log(
      "   ⚠️ customer product not found / env mismatch / org mismatch",
    );
    return;
  }

  if (cusProduct.internal_entity_id) {
    let customer = cusProduct.customer;
    let usagePrices = cusProduct.customer_prices.filter(
      (cp: FullCustomerPrice) =>
        getBillingType(cp.price.config!) === BillingType.UsageInArrear,
    );

    if (usagePrices.length > 0) {
      // Create invoice for remaining usage charges
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
        attachParams: {
          customer: cusProduct.customer!,
          org,
          invoiceOnly: false,

          // PLACEHOLDERS
          products: [],
          prices: [],
          entitlements: [],
          features: [],
          freeTrial: null,
          optionsList: [],
          entities: [],
        },
        newSubs: [subscription],
      });
    }
  }

  if (cusProduct.status === CusProductStatus.Expired) {
    console.log(
      `   ⚠️ customer product already expired, skipping: ${cusProduct.product.name} (${cusProduct.id})`,
    );
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

  let { curMainProduct } = await getExistingCusProducts({
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

  if (activeCusProducts.length === 0) {
    console.log(
      `   ⚠️ no customer products found with stripe sub id: ${subscription.id}`,
    );

    if (subscription.livemode) {
      throw new RecaseError({
        message: `Stripe subscription.deleted (live): no customer products found, subscription: ${subscription.id}`,
        code: ErrCode.NoActiveCusProducts,
        statusCode: 200,
      });
    }

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
        cusProduct,
        subscription,
        logger,
        env,
        org,
        prematurelyCanceled,
      }),
    );
  }

  await Promise.all(batchUpdate);
};
