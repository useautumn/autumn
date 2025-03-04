import { SupabaseClient } from "@supabase/supabase-js";
import { Stripe } from "stripe";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils.js";
import {
  AppEnv,
  BillingType,
  CusProductStatus,
  Entitlement,
  EntitlementWithFeature,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import { createStripeCli } from "../utils.js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { createStripeSubscription } from "../stripeSubUtils.js";
import {
  getBillingType,
  getPriceEntitlement,
  priceIsOneOffAndTiered,
} from "@/internal/prices/priceUtils.js";

export const itemMetasToOptions = async ({
  checkoutSession,
  attachParams,
  stripeCli,
}: {
  checkoutSession: Stripe.Checkout.Session;
  attachParams: AttachParams;
  stripeCli: Stripe;
}) => {
  const usageInAdvanceExists = attachParams.prices.some(
    (price) =>
      getBillingType(price.config as UsagePriceConfig) ==
      BillingType.UsageInAdvance
  );

  if (!usageInAdvanceExists) {
    return;
  }

  const response = await stripeCli.checkout.sessions.listLineItems(
    checkoutSession.id
  );

  const lineItems: Stripe.LineItem[] = response.data;

  // Should still work with old method?
  for (const price of attachParams.prices) {
    let config = price.config as UsagePriceConfig;
    if (getBillingType(config) != BillingType.UsageInAdvance) {
      continue;
    }

    const lineItem = lineItems.find(
      (li: any) =>
        li.price.id == config.stripe_price_id ||
        li.price.product == config.stripe_product_id
    );

    let quantity = 0;
    if (lineItem) {
      // 1. Handle one off tiered
      let relatedEnt = getPriceEntitlement(price, attachParams.entitlements);
      if (priceIsOneOffAndTiered(price, relatedEnt)) {
        quantity = (lineItem.quantity || 0) + (relatedEnt.allowance || 0);
      } else {
        quantity = lineItem.quantity || 0;
      }
    }

    const index = attachParams.optionsList.findIndex(
      (feature) => feature.internal_feature_id == config.internal_feature_id
    );

    if (index == -1) {
      attachParams.optionsList.push({
        feature_id: config.feature_id,
        internal_feature_id: config.internal_feature_id,
        quantity,
      });
    } else {
      attachParams.optionsList[index].quantity = quantity;
    }
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

  const stripeCli = createStripeCli({ org, env });
  await itemMetasToOptions({
    checkoutSession,
    attachParams,
    stripeCli,
  });

  console.log(
    "Handling checkout.completed: autumn metadata:",
    checkoutSession.metadata?.autumn_metadata_id
  );

  // Get product by stripe subscription ID
  if (checkoutSession.subscription) {
    const activeCusProducts = await CusProductService.getByStripeSubId({
      sb,
      stripeSubId: checkoutSession.subscription as string,
      orgId: org.id,
      env,
      inStatuses: [CusProductStatus.Active],
    });

    if (activeCusProducts && activeCusProducts.length > 0) {
      console.log(
        "   ✅ checkout.completed: subscription already exists, skipping"
      );
      return;
    }
  }

  // Create other subscriptions
  const itemSets = attachParams.itemSets;
  let remainingSets = itemSets ? itemSets.slice(1) : [];

  let otherSubscriptions: string[] = [];
  let invoiceIds: string[] = [checkoutSession.invoice as string];

  if (remainingSets && remainingSets.length > 0) {
    for (const itemSet of remainingSets) {
      const stripeCli = createStripeCli({ org, env });
      const subscription = await createStripeSubscription({
        stripeCli,
        customer: attachParams.customer,
        org,
        items: itemSet.items,
        freeTrial: attachParams.freeTrial, // add free trial to subscription...
        metadata: itemSet.subMeta,
        prices: itemSet.prices,
      });

      otherSubscriptions.push(subscription.id);
      invoiceIds.push(subscription.latest_invoice as string);
    }
  }
  if (checkoutSession.subscription) {
    otherSubscriptions.push(checkoutSession.subscription as string);
  }

  console.log("   - checkout.completed: creating full customer product");

  await createFullCusProduct({
    sb,
    attachParams,
    subscriptionId: checkoutSession.subscription as string,
    subscriptionIds: otherSubscriptions,
  });

  // Remove subscription item?

  console.log("   ✅ checkout.completed: successfully created cus product");
  console.log("   Invoices: ", invoiceIds);
  for (const invoiceId of invoiceIds) {
    try {
      const invoice = await stripeCli.invoices.retrieve(invoiceId);

      await InvoiceService.createInvoiceFromStripe({
        sb,
        org,
        stripeInvoice: invoice,
        internalCustomerId: attachParams.customer.internal_id,
        productIds: [attachParams.product.id],
        internalProductIds: [attachParams.product.internal_id],
      });

      console.log("   ✅ checkout.completed: successfully created invoice");
    } catch (error) {
      console.error("checkout.completed: error creating invoice", error);
    }
  }

  return;
};

// Old quantity method
// for (let i = 0; i < lineItems.length; i++) {
//   const item = lineItems[i];
//   const itemMeta = itemMetas[i];

//   if (!itemMeta) {
//     console.log("No item meta found, skipping");
//     continue;
//   }

//   // Feature ID:
//   const internalFeatureId = itemMeta.internal_feature_id;
//   const featureId = itemMeta.feature_id;

//   const index = attachParams.optionsList.findIndex(
//     (feature) => feature.internal_feature_id == internalFeatureId
//   );

//   if (index == -1) {
//     attachParams.optionsList.push({
//       feature_id: featureId,
//       internal_feature_id: internalFeatureId,
//       quantity: item.quantity,
//     });
//   } else {
//     attachParams.optionsList[index].quantity = item.quantity;
//   }
//   console.log(`Updated options list: ${featureId} - ${item.quantity}`);
// }
