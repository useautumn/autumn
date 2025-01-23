import { SupabaseClient } from "@supabase/supabase-js";
import { Stripe } from "stripe";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils.js";
import { AppEnv, Organization } from "@autumn/shared";

const getCheckoutMetadata = (checkoutSession: Stripe.Checkout.Session) => {
  const metadata: any = checkoutSession.metadata;
  metadata.prices_input = JSON.parse(metadata.prices_input);
  metadata.price_ids = JSON.parse(metadata.price_ids);
  metadata.entitlement_ids = JSON.parse(metadata.entitlement_ids);
  return metadata;
};

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

  const {
    org: metadataOrg,
    customer,
    product,
    prices,
    entitlements,
    optionsList,
    env: metadataEnv,
  } = metadata.data;

  if (metadataOrg.id != org.id) {
    console.log("checkout.completed: org doesn't match, skipping");
    return;
  }

  if (metadataEnv != env) {
    console.log("checkout.completed: environments don't match, skipping");
    return;
  }

  console.log(
    "Handling checkout.completed, autumn metadata:",
    checkoutSession.metadata?.autumn_metadata_id
  );

  await CusProductService.expireCurrentProduct({
    sb,
    internalCustomerId: customer.internal_id,
  });

  console.log("Creating full customer product");
  await createFullCusProduct({
    sb,
    customer,
    product,
    prices,
    entitlements,
    optionsList,
    subscriptionId: checkoutSession.subscription as string | undefined,
  });

  console.log("Successfully handled checkout completed");
  return;
};
