import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  activateDefaultProduct,
  activateFutureProduct,
  cancelCusProductSubscriptions,
} from "@/internal/customers/products/cusProductUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  CusProductStatus,
  CustomerEntitlement,
  ErrCode,
  FullCusProduct,
  FullCustomerEntitlement,
  Organization,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { subIsPrematurelyCanceled } from "../stripeSubUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";

export const handleSubscriptionDeleted = async ({
  sb,
  subscription,
  org,
  env,
  logger,
}: {
  sb: SupabaseClient;
  subscription: Stripe.Subscription;
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  console.log("Handling subscription.deleted: ", subscription.id);
  const activeCusProducts = await CusProductService.getByStripeSubId({
    sb,
    stripeSubId: subscription.id,
    orgId: org.id,
    env,
    withCusEnts: true,
  });

  if (activeCusProducts.length === 0) {
    console.log(
      `   ⚠️ no customer products found with stripe sub id: ${subscription.id}`
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

  // Delete from subscriptions
  try {
    await SubService.deleteFromStripeId({
      sb,
      stripeId: subscription.id,
    });
  } catch (error) {
    logger.error("Error deleting from subscriptions table", error);
  }

  // Prematurely canceled if cancel_at_period_end is false or cancel_at is more than 20 seconds apart from current_period_end
  let prematurelyCanceled = subIsPrematurelyCanceled(subscription);

  const handleCusProductDeleted = async (
    cusProduct: FullCusProduct,
    subscription: Stripe.Subscription
  ) => {
    if (
      !cusProduct ||
      cusProduct.customer.env !== env ||
      cusProduct.customer.org_id !== org.id
    ) {
      console.log(
        "   ⚠️ customer product not found / env mismatch / org mismatch"
      );
      return;
    }

    if (cusProduct.status === CusProductStatus.Expired) {
      console.log(
        `   ⚠️ customer product already expired, skipping: ${cusProduct.product.name} (${cusProduct.id})`
      );
      return;
    }

    if (
      cusProduct.scheduled_ids &&
      cusProduct.scheduled_ids.length > 0 &&
      !prematurelyCanceled
    ) {
      console.log(
        `   ⚠️ Cus product ${cusProduct.product.name} (${cusProduct.id}) has scheduled_ids and not prematurely canceled: removing subscription_id from cus product`
      );

      // Remove subscription_id from cus product
      await CusProductService.update({
        sb,
        cusProductId: cusProduct.id,
        updates: {
          subscription_ids: cusProduct.subscription_ids?.filter(
            (id) => id !== subscription.id
          ),
        },
      });

      return;
    }

    // 1. Expire current product
    await CusProductService.update({
      sb,
      cusProductId: cusProduct.id,
      updates: {
        status: CusProductStatus.Expired,
        ended_at: subscription.ended_at ? subscription.ended_at * 1000 : null,
      },
    });

    try {
      // 2. TODO: Clear entities
      let internalFeatureIds = new Set(
        cusProduct.customer_entitlements.map(
          (ce: FullCustomerEntitlement) => ce.entitlement.internal_feature_id!
        )
      );

      await EntityService.deleteByInternalFeatureId({
        sb,
        internalCustomerId: cusProduct.customer.internal_id,
        internalFeatureIds: Array.from(internalFeatureIds),
        orgId: org.id,
        env,
      });

      logger.info(
        `   ✅ deleted ${internalFeatureIds.size} entities for customer ${cusProduct.customer.id}`
      );
    } catch (error) {
      logger.error("Failed to delete entities on sub deleted");
      logger.error(error);
    }

    if (cusProduct.product.is_add_on) {
      return;
    }

    const activatedFuture = await activateFutureProduct({
      sb,
      cusProduct,
      subscription,
      org,
      env,
    });

    if (activatedFuture) {
      console.log("   ✅ activated future product");
      return;
    }

    // 2. Either activate future or default product
    const currentProduct = await CusProductService.getCurrentProductByGroup({
      sb,
      internalCustomerId: cusProduct.customer.internal_id,
      productGroup: cusProduct.product.group,
    });

    await activateDefaultProduct({
      productGroup: cusProduct.product.group,
      orgId: org.id,
      customer: cusProduct.customer,
      org,
      sb,
      env,
      curCusProduct: currentProduct,
    });

    // Cancel other subscriptions

    await cancelCusProductSubscriptions({
      sb,
      cusProduct,
      org,
      env,
      excludeIds: [subscription.id],
    });
  };

  const batchUpdate = [];
  for (const cusProduct of activeCusProducts) {
    batchUpdate.push(handleCusProductDeleted(cusProduct, subscription));
  }

  await Promise.all(batchUpdate);
};
