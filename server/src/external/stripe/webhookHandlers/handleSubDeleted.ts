import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { CusProductStatus, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const handleSubscriptionDeleted = async ({
  sb,
  subscription,
}: {
  sb: SupabaseClient;
  subscription: Stripe.Subscription;
}) => {
  console.log("Handling Stripe subscription.deleted:", subscription.id);

  const cusProduct = await CusProductService.getActiveByStripeSubId({
    sb,
    stripeSubId: subscription.id,
  });

  if (!cusProduct) {
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

  console.log("Stripe subscription deleted:", subscription.id);

  // Activate future product
  const futureProduct = await CusProductService.activateFutureProduct({
    sb,
    internalCustomerId: cusProduct.internal_customer_id,
    productGroup: cusProduct.product.group,
  });

  if (futureProduct) {
    console.log("Activated future product:", futureProduct.id);
  }

  if (!futureProduct) {
    console.log("No future product to activate, checking for default product");
  }
};
