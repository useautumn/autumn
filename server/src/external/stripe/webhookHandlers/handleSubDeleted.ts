import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  activateDefaultProduct,
  activateFutureProduct,
  cancelCusProductSubscriptions,
} from "@/internal/customers/products/cusProductUtils.js";
import {
  getBillingType,
  getPriceForOverage,
} from "@/internal/prices/priceUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  BillingType,
  CusProductStatus,
  Customer,
  ErrCode,
  FullCusProduct,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { payForInvoice } from "../stripeInvoiceUtils.js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { differenceInSeconds } from "date-fns";
import { subIsPrematurelyCanceled } from "../stripeSubUtils.js";

const billForRemainingUsages = async ({
  sb,
  fullCusProduct,
  subscription,
  org,
  customer,
}: {
  sb: SupabaseClient;
  fullCusProduct: FullCusProduct;
  subscription: Stripe.Subscription;
  org: Organization;
  customer: Customer;
}) => {
  const { customer_prices, customer_entitlements } = fullCusProduct;
  const usagePriceExists = customer_prices.some(
    (cp) => getBillingType(cp.price.config!) === BillingType.UsageInArrear
  );

  if (!usagePriceExists) {
    return;
  }

  // 1. Create invoice
  console.log("subscription.deleted, billing for remaining usages");
  const stripeCli = createStripeCli({
    org: org,
    env: customer.env,
  });

  // Get usage based prices
  let itemsToInvoice = [];
  for (const cp of customer_prices) {
    let config = cp.price.config! as UsagePriceConfig;
    let relatedCusEnt = customer_entitlements.find(
      (cusEnt) =>
        cusEnt.entitlement.internal_feature_id === config.internal_feature_id
    );

    if (
      !relatedCusEnt ||
      !relatedCusEnt.usage_allowed ||
      !relatedCusEnt.balance
    ) {
      continue;
    }

    if (relatedCusEnt?.balance > 0) {
      continue;
    }

    let internalFeatureId = relatedCusEnt?.entitlement.internal_feature_id;
    let usageFeatures;
    try {
      usageFeatures = JSON.parse(subscription.metadata.usage_features);
    } catch (error) {
      console.log("Error parsing usage features", error);
      continue;
    }

    if (!usageFeatures.includes(internalFeatureId)) {
      continue;
    }

    // Amount to bill?
    let usage = relatedCusEnt?.entitlement.allowance! - relatedCusEnt?.balance!;
    let overage = -relatedCusEnt?.balance!;

    if (getBillingType(config) === BillingType.UsageInArrear) {
      itemsToInvoice.push({
        usage,
        overage,
        featureId: relatedCusEnt?.entitlement.feature.id,
        price: cp.price,
        relatedCusEnt,
      });
    }
  }

  if (itemsToInvoice.length === 0) {
    return;
  }

  const invoice = await stripeCli.invoices.create({
    customer: customer.processor.id,
    auto_advance: true,
  });

  // 2. Add items to invoice
  console.log("Billing for remaining usages");
  for (const item of itemsToInvoice) {
    const amount = getPriceForOverage(item.price, item.overage);

    console.log(
      `   feature: ${item.featureId}, usage: ${item.usage}, amount: ${amount}`
    );

    await stripeCli.invoiceItems.create({
      customer: customer.processor.id,
      amount: Math.round(amount * 100),
      invoice: invoice.id,
      currency: org.default_currency,
      description: `${fullCusProduct.product.name} - ${item.featureId} x ${item.usage}`,
    });

    // Set cus ent to 0
    await CustomerEntitlementService.update({
      sb,
      id: item.relatedCusEnt!.id,
      updates: {
        balance: 0,
      },
    });
  }

  // Finalize and pay invoice
  await stripeCli.invoices.finalizeInvoice(invoice.id);
  const { paid, error } = await payForInvoice({
    fullOrg: org,
    env: customer.env,
    customer,
    invoice,
  });

  if (!paid) {
    console.log(
      `ERROR, failed to bill for remaining usages, org: ${org.slug}, customer: ${customer.id}, invoice: ${invoice.id}`
    );
  }

  let curProduct = fullCusProduct.product;

  const finalInvoice = await stripeCli.invoices.retrieve(invoice.id);
  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice: finalInvoice,
    internalCustomerId: customer.internal_id,
    org: org,
    productIds: [curProduct.id],
    internalProductIds: [curProduct.internal_id],
  });
};

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

    // If there's scheduled_id, skip?
    // Prematurely canceled
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

    // 1. Expire current product -> Probably going to be a problem...?
    await CusProductService.update({
      sb,
      cusProductId: cusProduct.id,
      updates: {
        status: CusProductStatus.Expired,
        ended_at: subscription.ended_at ? subscription.ended_at * 1000 : null,
      },
    });

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
      excludeIds: [cusProduct.id],
    });
  };

  const batchUpdate = [];
  for (const cusProduct of activeCusProducts) {
    batchUpdate.push(handleCusProductDeleted(cusProduct, subscription));
  }

  await Promise.all(batchUpdate);
};
