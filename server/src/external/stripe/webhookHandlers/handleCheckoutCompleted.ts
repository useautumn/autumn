import { SupabaseClient } from "@supabase/supabase-js";
import { Stripe } from "stripe";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils.js";
import { AppEnv, Organization } from "@autumn/shared";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import { createStripeCli } from "../utils.js";

export const itemMetasToOptions = async ({
  itemMetas,
  checkoutSession,
  attachParams,
  stripeCli,
}: {
  itemMetas: any[];
  checkoutSession: Stripe.Checkout.Session;
  attachParams: AttachParams;
  stripeCli: Stripe;
}) => {
  // For each line item

  const response = await stripeCli.checkout.sessions.listLineItems(
    checkoutSession.id
  );

  const lineItems = response.data;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const itemMeta = itemMetas[i];

    if (!itemMeta) {
      console.log("No item meta found, skipping");
      continue;
    }

    // Feature ID:
    const internalFeatureId = itemMeta.internal_feature_id;
    const featureId = itemMeta.feature_id;

    const index = attachParams.optionsList.findIndex(
      (feature) => feature.internal_feature_id == internalFeatureId
    );

    if (index == -1) {
      attachParams.optionsList.push({
        feature_id: featureId,
        internal_feature_id: internalFeatureId,
        quantity: item.quantity,
      });
    } else {
      attachParams.optionsList[index].quantity = item.quantity;
    }
    console.log(`Updated options list: ${featureId} - ${item.quantity}`);
  }
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

  // Get options
  const attachParams: AttachParams = metadata.data;
  if (attachParams.org.id != org.id) {
    console.log("checkout.completed: org doesn't match, skipping");
    return;
  }

  if (attachParams.customer.env != env) {
    console.log("checkout.completed: environments don't match, skipping");
    return;
  }

  const itemMetas = metadata.data.itemMetas;
  const stripeCli = createStripeCli({ org, env });
  await itemMetasToOptions({
    itemMetas,
    checkoutSession,
    attachParams,
    stripeCli,
  });

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

  console.log("   - checkout.completed: creating full customer product");
  await createFullCusProduct({
    sb,
    attachParams,
    subscriptionId: checkoutSession.subscription as string | undefined,
  });

  console.log("   ✅ checkout.completed: successfully created cus product");
  return;
};
