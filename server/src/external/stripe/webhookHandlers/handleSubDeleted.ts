import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { AppEnv, CusProductStatus, Organization } from "@autumn/shared";
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
  // console.log("Handling Stripe subscription.deleted:", subscription.id);

  console.log("Handling subscription.deleted: ", subscription.id);
  const cusProduct = await CusProductService.getActiveByStripeSubId({
    sb,
    stripeSubId: subscription.id,
    orgId: org.id,
    env,
  });

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
  } else {
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

  // const futureProduct = await CusProductService.activateFutureProduct({
  //   sb,
  //   internalCustomerId: cusProduct.internal_customer_id,
  //   productGroup: cusProduct.product.group,
  // });

  // if (futureProduct) {
  //   console.log("Activated future product:", futureProduct.id);
  // }

  // if (!futureProduct) {
  //   console.log("No future product to activate, checking for default product");
  // }
};
