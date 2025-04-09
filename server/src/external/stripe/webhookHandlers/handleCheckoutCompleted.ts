import { SupabaseClient } from "@supabase/supabase-js";
import { Stripe } from "stripe";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils.js";
import {
  AppEnv,
  BillingType,
  CusProductStatus,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import { createStripeCli } from "../utils.js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";

import {
  getBillingType,
  getPriceEntitlement,
  priceIsOneOffAndTiered,
  pricesOnlyOneOff,
} from "@/internal/prices/priceUtils.js";
import {
  attachToInsertParams,
  getPricesForProduct,
} from "@/internal/products/productUtils.js";
import { getStripeExpandedInvoice } from "../stripeInvoiceUtils.js";
import { createStripeSub } from "../stripeSubUtils/createStripeSub.js";
import { getAlignedIntervalUnix } from "@/internal/prices/billingIntervalUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { generateId } from "@/utils/genUtils.js";

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

  // GET COUPON

  const stripeCli = createStripeCli({ org, env });

  // return;
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
  let checkoutSub;
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

    // Check if any prices are in arrear prorated
    const subscription = await stripeCli.subscriptions.retrieve(
      checkoutSession.subscription as string
    );

    checkoutSub = subscription;

    // 1. Insert sub into db
    await SubService.createSub({
      sb,
      sub: {
        id: generateId("sub"),
        created_at: Date.now(),
        stripe_id: checkoutSession.subscription as string,
        stripe_schedule_id: null,
        usage_features: attachParams.itemSets?.[0]?.usageFeatures || [],
        org_id: org.id,
        env: attachParams.customer.env,
      },
    });

    for (const item of subscription.items.data) {
      let stripePriceId = item.price.id;
      let autumnPrice = attachParams.prices.find(
        (p) =>
          (p.config! as UsagePriceConfig).stripe_placeholder_price_id ==
          stripePriceId
      );

      if (!autumnPrice) {
        continue;
      }

      // Add new subscription item
      let config = autumnPrice.config as UsagePriceConfig;
      await stripeCli.subscriptionItems.update(item.id, {
        price: config.stripe_price_id!,
        quantity: 0,
      });
    }
  }

  // Create other subscriptions
  const itemSets = attachParams.itemSets;
  let remainingSets = itemSets ? itemSets.slice(1) : [];

  let otherSubscriptions: string[] = [];
  let invoiceIds: string[] = [checkoutSession.invoice as string];

  if (remainingSets && remainingSets.length > 0) {
    const firstSetStart = checkoutSub?.current_period_end;
    if (!firstSetStart) {
      console.error(
        `checkout.completed: first set start not found for subscription: ${checkoutSession.subscription}`
      );
      return;
    }

    for (const itemSet of remainingSets) {
      const stripeCli = createStripeCli({ org, env });

      // Handle billing cycle anchor...
      const billingCycleAnchorUnix = getAlignedIntervalUnix(
        firstSetStart * 1000,
        itemSet.interval
      );

      const subscription = await createStripeSub({
        sb,
        stripeCli,
        customer: attachParams.customer,
        org,
        itemSet,
        freeTrial: attachParams.freeTrial, // add free trial to subscription...
        billingCycleAnchorUnix,
      });

      otherSubscriptions.push(subscription.id);
      invoiceIds.push(subscription.latest_invoice as string);
    }
  }
  if (checkoutSession.subscription) {
    otherSubscriptions.push(checkoutSession.subscription as string);
  }

  console.log("   - checkout.completed: creating full customer product");

  const products = attachParams.products;

  for (const product of products) {
    let pricesForProduct = getPricesForProduct(product, attachParams.prices);
    let isOneOff = pricesOnlyOneOff(pricesForProduct);
    await createFullCusProduct({
      sb,
      attachParams: attachToInsertParams(attachParams, product),
      subscriptionId: !isOneOff
        ? (checkoutSession.subscription as string)
        : undefined,
      subscriptionIds: !isOneOff ? otherSubscriptions : undefined,
      anchorToUnix: !isOneOff
        ? checkoutSub?.current_period_end
          ? checkoutSub.current_period_end * 1000
          : undefined
        : undefined,
    });
  }

  console.log("   ✅ checkout.completed: successfully created cus product");
  console.log("   Invoices: ", invoiceIds);
  for (const invoiceId of invoiceIds) {
    try {
      const invoice = await getStripeExpandedInvoice({
        stripeCli,
        stripeInvoiceId: invoiceId,
      });

      await InvoiceService.createInvoiceFromStripe({
        sb,
        org,
        stripeInvoice: invoice,
        internalCustomerId: attachParams.customer.internal_id,
        productIds: products.map((p) => p.id),
        internalProductIds: products.map((p) => p.internal_id),
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
