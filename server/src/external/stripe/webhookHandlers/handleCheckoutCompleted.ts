import { SupabaseClient } from "@supabase/supabase-js";
import { Stripe } from "stripe";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils.js";
import { AppEnv, Organization } from "@autumn/shared";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";

export const handleCheckoutSessionCompleted = async ({
  sb,
  org,
  checkoutSession,
  env,
}: {
  sb: SupabaseClient;
  org: Organization;
  checkoutSession: Stripe.Checkout.Session;
  env: AppEnv;
}) => {
  const metadata = await getMetadataFromCheckoutSession(checkoutSession, sb);
  if (!metadata) {
    console.log("checkout.completed: metadata not found, skipping");
    return;
  }

  const attachParams: AttachParams = metadata.data;

  if (attachParams.org.id != org.id) {
    console.log("checkout.completed: org doesn't match, skipping");
    return;
  }

  if (attachParams.customer.env != env) {
    console.log("checkout.completed: environments don't match, skipping");
    return;
  }

  console.log(
    "   - checkout.completed: autumn metadata:",
    checkoutSession.metadata?.autumn_metadata_id
  );

  // Get product by stripe subscription ID
  if (checkoutSession.subscription) {
    const exists = await CusProductService.getActiveByStripeSubId({
      sb,
      stripeSubId: checkoutSession.subscription as string,
    });

    if (exists) {
      console.log(
        "   ✅ checkout.completed: subscription already exists, skipping"
      );
      return;
    }
  }

  await CusProductService.expireCurrentProduct({
    sb,
    internalCustomerId: attachParams.customer.internal_id,
    productGroup: attachParams.product.group,
  });

  console.log("   - checkout.completed: creating full customer product");
  await createFullCusProduct({
    sb,
    attachParams,
    subscriptionId: checkoutSession.subscription as string | undefined,
  });

  console.log("   ✅ checkout.completed: successfully created cus product");
  return;
};
