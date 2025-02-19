import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  CusProductStatus,
  ErrCode,
  FullCusProduct,
  Organization,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const handleSubscriptionDeleted = async ({
  sb,
  subscription,
  org,
  env,
}: {
  sb: SupabaseClient;
  subscription: Stripe.Subscription;
  org: Organization;
  env: AppEnv;
}) => {
  console.log("Handling subscription.deleted: ", subscription.id);
  const activeCusProducts = await CusProductService.getByStripeSubId({
    sb,
    stripeSubId: subscription.id,
    orgId: org.id,
    env,
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

  console.log("   ✅ found active customer products");

  const handleCusProductDeleted = async (cusProduct: FullCusProduct) => {
    // TODO: Implement

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

    const { error } = await sb
      .from("customer_products")
      .update({
        status: CusProductStatus.Expired,
        ended_at: subscription.ended_at ? subscription.ended_at * 1000 : null,
      })
      .eq("id", cusProduct.id);

    if (error) {
      console.log(
        "Failed to update customer product status to expired:",
        error.message
      );
      return;
    }

    console.log("   ✅ updated customer product status to expired");

    // Activate future product
    const futureProduct = await CusProductService.getFutureProduct({
      sb,
      internalCustomerId: cusProduct.internal_customer_id,
      productGroup: cusProduct.product.group,
    });

    if (futureProduct) {
      const updated = await CusProductService.update({
        sb,
        cusProductId: futureProduct.id,
        updates: {
          status: CusProductStatus.Active,
        },
      });

      console.log("   ✅ activated future product");
    }

    // Activate default product
    else if (!cusProduct.product.is_add_on) {
      const defaultProducts = await ProductService.getFullDefaultProducts({
        sb,
        orgId: org.id,
        env,
      });

      const defaultProd = defaultProducts.find(
        (p) => p.group === cusProduct.product.group
      );

      if (defaultProd) {
        await createFullCusProduct({
          sb,
          attachParams: {
            org,
            customer: cusProduct.customer,
            product: defaultProd,
            prices: defaultProd.prices,
            entitlements: defaultProd.entitlements,
            freeTrial: defaultProd.free_trial,
            optionsList: [],
          },
        });

        console.log("   ✅ activated default product");
      } else {
        console.log("   ⚠️ no default product to activate");
      }
    }
  };

  const batchUpdate = [];
  for (const cusProduct of activeCusProducts) {
    batchUpdate.push(handleCusProductDeleted(cusProduct));
  }

  await Promise.all(batchUpdate);
};
