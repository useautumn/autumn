import { FullCustomerEntitlement } from "@shared/models/cusModels/cusEntModels/cusEntitlementModels.js";
import {
  AppEnv,
  BillingType,
  CusProduct,
  Customer,
  ErrCode,
  Event,
  Feature,
  FullCustomerPrice,
  InvoiceItem,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

import { getRelatedCusPrice } from "@/internal/customers/entitlements/cusEntUtils.js";
import {
  getBillingType,
  getPriceForOverage,
} from "@/internal/prices/priceUtils.js";

import {
  getStripeSubs,
  getUsageBasedSub,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";

import { Decimal } from "decimal.js";
import { InvoiceItemService } from "@/internal/customers/invoices/InvoiceItemService.js";
import { generateId } from "@/utils/genUtils.js";
import { createStripeInvoiceItem } from "@/internal/customers/invoices/invoiceItemUtils.js";

type CusEntWithCusProduct = FullCustomerEntitlement & {
  customer_product: CusProduct;
};

export const adjustAllowance = async ({
  sb,
  env,
  org,
  affectedFeature,
  cusEnt,
  cusPrices,
  event,
  customer,
  originalBalance,
  newBalance,
  deduction,
}: {
  sb: SupabaseClient;
  env: AppEnv;
  affectedFeature: Feature;
  org: Organization;
  cusEnt: CusEntWithCusProduct;
  cusPrices: FullCustomerPrice[];
  event: Event;
  customer: Customer;
  originalBalance: number;
  newBalance: number;
  deduction: number;
}) => {
  // Get customer entitlement

  // 1. Check if price is prorated in arrear, if not skip...
  let cusPrice = getRelatedCusPrice(cusEnt, cusPrices);
  let billingType = cusPrice ? getBillingType(cusPrice.price.config!) : null;
  let cusProduct = cusEnt.customer_product;
  if (!cusPrice || billingType !== BillingType.InArrearProrated) {
    return;
  }

  // 2. If original balance and new balance are both > 0, skip...
  if (originalBalance >= 0 && newBalance >= 0) {
    return;
  }

  // If cross boundary for billing units, then do this...
  let boundaryCrossed = false;
  let billingUnits =
    (cusPrice.price.config as UsagePriceConfig).billing_units || 1;

  let origUsage = -originalBalance;
  let newUsage = -newBalance;

  // Find which billing unit boundaries we're in
  let origBoundary = Math.floor(origUsage / billingUnits!) * billingUnits!;
  let newBoundary = Math.floor(newUsage / billingUnits!) * billingUnits!;

  if (
    // Usage increase: moved to a higher billing unit boundary
    (newBoundary > origBoundary && deduction > 0) ||
    // Usage decrease: moved to a lower billing unit boundary
    (newBoundary < origBoundary && deduction < 0)
  ) {
    boundaryCrossed = true;
  }

  if (!boundaryCrossed) {
    console.log("   - In arrear prorated: boundary not crossed, skipping");
    return;
  }

  console.log(`Updating prorated in arrear usage for ${affectedFeature.name}`);
  console.log(
    `   - Customer: ${customer.name} (${customer.id}), Org: ${org.slug}`
  );
  console.log(`   - Allowance: ${cusEnt.entitlement.allowance!}`);
  console.log(`   - Balance: ${originalBalance} -> ${newBalance}`);

  if (!cusProduct) {
    console.log("❗️ Error: can't adjust allowance, no customer product found");
    return;
  }

  let stripeCli = createStripeCli({ org, env });
  let sub = await getUsageBasedSub({
    stripeCli,
    subIds: cusProduct.subscription_ids!,
    feature: affectedFeature,
  });

  if (!sub) {
    console.log("❗️ Error: can't adjust allowance, no usage-based sub found");
    return;
  }

  // 1. Get latest invoice item not added to Stripe... otherwise might be have created_at on same time?
  let latestInvoiceItem = await InvoiceItemService.getNotAddedToStripe({
    sb,
    cusPriceId: cusPrice.id,
  });

  let now = Date.now();
  if (env == AppEnv.Sandbox && sub.test_clock) {
    // Get customer test clock
    let testClock = await stripeCli.testHelpers.testClocks.retrieve(
      sub.test_clock as string
    );
    now = testClock.frozen_time * 1000;
  }

  // 2. If latest invoice item exists, update...
  if (latestInvoiceItem) {
    let originalAmount = new Decimal(latestInvoiceItem.amount!);
    let denominator =
      latestInvoiceItem.proration_end - latestInvoiceItem.proration_start;
    let numerator = now - latestInvoiceItem.proration_start;

    let newAmount = originalAmount.mul(numerator).div(denominator).toNumber();

    // Insert into Stripe
    await createStripeInvoiceItem({
      stripeCli,
      sub,
      customer,
      invoiceItem: {
        ...latestInvoiceItem,
        amount: newAmount,
        updated_at: now,
        proration_end: now,
      },
      feature: affectedFeature,
    });

    await InvoiceItemService.update({
      sb,
      invoiceItemId: latestInvoiceItem.id,
      updates: {
        updated_at: now,
        proration_end: now,
        amount: newAmount,
        added_to_stripe: true,
      },
    });

    console.log("   ✅ Updated latest invoice item and inserted into Stripe");
  }

  // Insert new invoice item
  if (newBalance < 0) {
    let allowance = new Decimal(cusEnt.entitlement.allowance!);
    let usage = allowance.minus(newBalance).toNumber();
    usage = Math.ceil(usage / billingUnits!) * billingUnits!; // round up to nearest billing unit

    let totalAmount = getPriceForOverage(cusPrice.price, -newBalance);
    let numerator = sub.current_period_end * 1000 - now;
    let denominator =
      sub.current_period_end * 1000 - sub.current_period_start * 1000;
    let proratedAmount = new Decimal(totalAmount)
      .mul(numerator)
      .div(denominator)
      .toNumber();

    let newInvoiceItem: InvoiceItem = {
      id: generateId("inv_item"),
      customer_price_id: cusPrice.id,
      customer_id: customer.id,
      created_at: now,
      updated_at: now,
      period_start: sub.current_period_start * 1000,
      period_end: sub.current_period_end * 1000,
      proration_start: now,
      proration_end: sub.current_period_end * 1000,
      amount: proratedAmount,
      currency: org.default_currency,
      quantity: usage,
      added_to_stripe: false,
    };

    await InvoiceItemService.insert({
      sb,
      data: newInvoiceItem,
    });
    console.log("   ✅ Inserted new invoice item");
  }

  return;
};

// 1. FOR CROSSING BOUNDARY AT END

// let boundaryCrossed = false;
// let billingUnits =
//   (cusPrice.price.config as UsagePriceConfig).billing_units || 1;
// let origUsage = -originalBalance;
// let newUsage = -newBalance;
// let nextBlock = Math.ceil(origUsage / billingUnits) * billingUnits;

// console.log(`Next block: ${nextBlock}`);
// console.log("Original usage:", origUsage);
// console.log("New usage:", newUsage);
// if (newUsage == nextBlock || newUsage == nextBlock - billingUnits) {
//   boundaryCrossed = true;
// }

// PRORATION WITH STRIPE
// let relatedCusPrice = getRelatedCusPrice(cusEnt, cusPrices);

// if (!relatedCusPrice || !cusEnt.customer_product) {
//   console.log("No related cus price / cus product found");
//   return;
// }

// // Get sub

// const stripeSubs = await getStripeSubs({
//   stripeCli,
//   subIds: cusEnt.customer_product.subscription_ids!,
// });

// let stripeSub = stripeSubs[0];

// let priceConfig = relatedCusPrice.price.config as UsagePriceConfig;
// let subItem = stripeSub.items.data.find(
//   (item) => item.price.id === priceConfig.stripe_price_id
// );

// let originalUsage = new Decimal(cusEnt.entitlement.allowance!)
//   .minus(originalBalance)
//   .toNumber();

// let newUsage = new Decimal(originalUsage).plus(deduction).toNumber();
// console.log(`Original usage: ${originalUsage}`);
// console.log("New usage:", newUsage);
// let featureName = affectedFeature.name;

// subItem = await stripeCli.subscriptionItems.create({
//   subscription: stripeSub.id,
//   price: priceConfig.stripe_price_id!,
//   quantity: originalUsage,
//   proration_date: stripeSub.current_period_end,
// });

// await stripeCli.subscriptionItems.update(subItem.id, {
//   quantity: newUsage,
//   proration_behavior: "create_prorations",
// });

// // if (!subItem) {
// //   console.log(
// //     `Creating sub item for feature ${featureName} ${originalUsage}`
// //   );
// //   subItem = await stripeCli.subscriptionItems.create({
// //     subscription: stripeSub.id,
// //     price: priceConfig.stripe_price_id!,
// //     quantity: newUsage,
// //     proration_behavior: "create_prorations",
// //   });
// // } else {
// //   subItem = await stripeCli.subscriptionItems.create({
// //     subscription: stripeSub.id,
// //     price: priceConfig.stripe_price_id!,
// //     quantity: originalUsage,
// //     proration_date: stripeSub.current_period_end,
// //   });

// //   await stripeCli.subscriptionItems.update(subItem.id, {
// //     quantity: newUsage,
// //     proration_behavior: "create_prorations",
// //   });
// // }

// await stripeCli.subscriptionItems.del(subItem.id, {
//   proration_date: stripeSub.current_period_end,
// });

// // await stripeCli.subscriptionItems.update(subItem.id, {
// //   proration_date: stripeSub.current_period_end,
// //   quantity: 0,
// // });

// // console.log(`Updated sub item quantity to 0 for period end`);
