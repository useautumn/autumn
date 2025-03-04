import { CusProductService } from "@/internal/customers/products/CusProductService.js";

import {
  AppEnv,
  BillingType,
  CusProductStatus,
  Customer,
  EntInterval,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  InvoiceItem,
  Organization,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";
import { differenceInHours, format, subDays } from "date-fns";
import { getStripeSubs, getUsageBasedSub } from "../stripeSubUtils.js";
import {
  getBillingType,
  getPriceForOverage,
} from "@/internal/prices/priceUtils.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { Decimal } from "decimal.js";
import { InvoiceItemService } from "@/internal/customers/invoices/InvoiceItemService.js";
import { createStripeInvoiceItem } from "@/internal/customers/invoices/invoiceItemUtils.js";
import { getRelatedCusEnt } from "@/internal/customers/prices/cusPriceUtils.js";
import { getNextEntitlementReset } from "@/utils/timeUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { getMinCusEntBalance } from "@/internal/customers/entitlements/cusEntUtils.js";
import { getResetBalancesUpdate } from "@/internal/customers/entitlements/groupByUtils.js";

const handleInArrearProrated = async ({
  sb,
  cusEnts,
  cusPrice,
  customer,
  org,
  env,
  invoice,
  usageSub,
}: {
  sb: SupabaseClient;
  cusEnts: FullCustomerEntitlement[];
  cusPrice: FullCustomerPrice;
  customer: Customer;
  org: Organization;
  env: AppEnv;
  invoice: Stripe.Invoice;
  usageSub: Stripe.Subscription;
}) => {
  const cusEnt = getRelatedCusEnt({
    cusPrice,
    cusEnts,
  });

  if (!cusEnt) {
    console.log("No related cus ent found");
    return;
  }

  let invoiceItem = await InvoiceItemService.getNotAddedToStripe({
    sb,
    cusPriceId: cusPrice.id,
  });

  if (invoiceItem) {
    await createStripeInvoiceItem({
      stripeCli: createStripeCli({ org, env }),
      customer: customer,
      invoiceItem: invoiceItem,
      feature: cusEnt.entitlement.feature,
      invoiceId: invoice.id,
    });
    console.log("   ✅ Added last invoice item to Stripe");

    await InvoiceItemService.update({
      sb,
      invoiceItemId: invoiceItem.id,
      updates: {
        added_to_stripe: true,
      },
    });

    console.log("   ✅ Set `added_to_stripe` to true for invoice item");
  }

  // Reset?
  if (cusEnt.next_reset_at) {
    let resetBalancesUpdate = getResetBalancesUpdate({ cusEnt });
    await CustomerEntitlementService.update({
      sb,
      id: cusEnt.id,
      updates: {
        ...resetBalancesUpdate,
        next_reset_at: getNextEntitlementReset(
          null,
          cusEnt.entitlement.interval as EntInterval
        ).getTime(),
      },
    });

    console.log("   ✅ Reset next_reset_at");
  } else {
    // Create invoice for new usage?
    let allowance = cusEnt.entitlement.allowance!;
    // let balance = cusEnt.balance!;
    let minBalance = getMinCusEntBalance({ cusEnt });

    let amount = getPriceForOverage(cusPrice.price, -minBalance);
    let quantity = allowance - minBalance;
    let billingUnits =
      (cusPrice.price.config as UsagePriceConfig).billing_units || 1;
    quantity = Math.ceil(quantity / billingUnits!) * billingUnits!; // round up to nearest billing unit

    if (minBalance >= 0) {
      console.log("   ✅ Balance >= 0, no need to create Autumn invoice item");
      return;
    }

    console.log("   🔍 Min balance: ", minBalance);
    console.log("   🔍 Allowance: ", allowance);
    console.log("   🔍 Quantity: ", quantity);

    let newInvoiceItem: InvoiceItem = {
      id: generateId("inv_item"),
      customer_price_id: cusPrice.id,
      added_to_stripe: false,
      customer_id: customer.id,
      created_at: Date.now(),
      updated_at: Date.now(),
      currency: org.default_currency,
      period_start: usageSub.current_period_start * 1000,
      period_end: usageSub.current_period_end * 1000,
      proration_start: usageSub.current_period_start * 1000,
      proration_end: usageSub.current_period_end * 1000,
      quantity: quantity,
      amount: amount,
    };
    await InvoiceItemService.insert({
      sb,
      data: newInvoiceItem,
    });
    console.log("   ✅ Created new Autumn invoice item");
  }
};

const handleUsageInArrear = async ({
  sb,
  invoice,
  customer,
  relatedCusEnt,
  stripeCli,
  price,
  usageSub,
}: {
  sb: SupabaseClient;
  invoice: Stripe.Invoice;
  customer: Customer;
  relatedCusEnt: FullCustomerEntitlement;
  stripeCli: Stripe;
  price: Price;
  usageSub: Stripe.Subscription;
}) => {
  let allowance = relatedCusEnt.entitlement.allowance!;
  // let balance = relatedCusEnt.balance!;
  let minBalance = getMinCusEntBalance({ cusEnt: relatedCusEnt });

  // If relatedCusEnt's balance > 0 and next_reset_at is null, skip...
  if (relatedCusEnt.balance! > 0 && !relatedCusEnt.next_reset_at) {
    console.log("Balance > 0 and next_reset_at is null, skipping");
    return;
  }

  const usage = new Decimal(allowance).minus(minBalance).toNumber();
  const usageTimestamp = Math.round(
    subDays(new Date(invoice.created * 1000), 1).getTime() / 1000
  );

  await stripeCli.billing.meterEvents.create({
    event_name: price.id!,
    payload: {
      stripe_customer_id: customer.processor.id,
      value: Math.round(usage).toString(),
    },
    timestamp: usageTimestamp,
  });

  console.log(`Submitted meter event for ${customer.name}, ${customer.id}`);
  console.log(`Feature ID: ${relatedCusEnt.entitlement.feature.id}`);
  console.log(
    `Allowance: ${allowance}, Min Balance: ${minBalance}, Usage: ${usage}`
  );
  console.log(
    "Invoice created: ",
    format(new Date(invoice.created * 1000), "yyyy-MM-dd"),
    "Usage timestamp: ",
    format(new Date(usageTimestamp * 1000), "yyyy-MM-dd")
  );

  // reset balance
  let resetBalancesUpdate = getResetBalancesUpdate({ cusEnt: relatedCusEnt });
  await CustomerEntitlementService.update({
    sb,
    id: relatedCusEnt.id,
    updates: {
      ...resetBalancesUpdate,
      adjustment: 0,
      next_reset_at: relatedCusEnt.next_reset_at
        ? usageSub.current_period_end * 1000
        : null, // TODO: check if this is correct
    },
  });

  // console.log("Reset balance & adjustment");
};

export const sendUsageAndReset = async ({
  sb,
  activeProduct,
  org,
  env,
  invoice,
  stripeSubs,
}: {
  sb: SupabaseClient;
  activeProduct: FullCusProduct;
  org: Organization;
  env: AppEnv;
  invoice: Stripe.Invoice;
  stripeSubs: Stripe.Subscription[];
}) => {
  // Get cus ents
  const cusProductWithEntsAndPrices = await CusProductService.getEntsAndPrices({
    sb,
    cusProductId: activeProduct.id,
  });

  const cusEnts = cusProductWithEntsAndPrices.customer_entitlements;
  const cusPrices = cusProductWithEntsAndPrices.customer_prices;

  const stripeCli = createStripeCli({ org, env });
  const customer = activeProduct.customer;

  for (const cusPrice of cusPrices) {
    const price = cusPrice.price;
    let billingType = getBillingType(price.config);

    if (
      billingType !== BillingType.UsageInArrear
      // && billingType !== BillingType.InArrearProrated
    ) {
      continue;
    }

    let relatedCusEnt = getRelatedCusEnt({
      cusPrice,
      cusEnts,
    });

    if (!relatedCusEnt) {
      continue;
    }

    let usageBasedSub = await getUsageBasedSub({
      stripeCli,
      subIds: activeProduct.subscription_ids || [],
      feature: relatedCusEnt.entitlement.feature,
      stripeSubs,
    });

    if (!usageBasedSub || usageBasedSub.id != invoice.subscription) {
      continue;
    }

    console.log("invoice.created, handling end of period usage");
    console.log(
      `   - Org: ${org.slug}, Customer: ${customer.name} (${customer.id})`
    );
    console.log("   - Feature: ", relatedCusEnt.entitlement.feature.id);

    // if (billingType == BillingType.InArrearProrated) {
    //   console.log("   ✨ In arrear (PRORATED)");
    //   await handleInArrearProrated({
    //     sb,
    //     cusEnts,
    //     cusPrice,
    //     customer,
    //     org,
    //     env,
    //     invoice,
    //     usageSub: usageBasedSub,
    //   });
    //   continue;
    // }

    if (billingType == BillingType.UsageInArrear) {
      console.log("   ✨ In arrear (NO PRORATION)");
      await handleUsageInArrear({
        sb,
        invoice,
        customer,
        relatedCusEnt,
        stripeCli,
        price,
        usageSub: usageBasedSub,
      });
    }
    // For regular end of period billing
  }
};

export const handleInvoiceCreated = async ({
  sb,
  org,
  invoice,
  env,
  event,
}: {
  sb: SupabaseClient;
  org: Organization;
  invoice: Stripe.Invoice;
  env: AppEnv;
  event: Stripe.Event;
}) => {
  console.log("Invoice created: ", invoice.id);
  // Get stripe subscriptions
  if (invoice.subscription) {
    console.log("Subscription ID:", invoice.subscription);
    const activeProducts = await CusProductService.getByStripeSubId({
      sb,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
      inStatuses: [CusProductStatus.Active, CusProductStatus.Expired],
    });

    if (activeProducts.length != 1) {
      console.log(
        "Invalid number of active products for invoice.created: ",
        activeProducts.length
      );
      return;
    }

    const activeProduct = activeProducts[0];

    if (
      Math.abs(
        differenceInHours(
          new Date(activeProduct.created_at),
          new Date(invoice.created * 1000)
        )
      ) < 1
    ) {
      console.log(
        "invoice.created: cus product created < an hour ago, skipping"
      );
      // Probably just created
      return;
    }

    // Create invoice for end of period prorated

    const stripeSubs = await getStripeSubs({
      stripeCli: createStripeCli({ org, env }),
      subIds: activeProduct.subscription_ids,
    });

    await sendUsageAndReset({
      sb,
      activeProduct,
      org,
      env,
      // usageFeatures,
      stripeSubs,
      invoice,
    });

    // for (const sub of stripeSubs) {
    //   if (sub.id != invoice.subscription) {
    //     continue;
    //   }

    //   const subMeta = sub.metadata;
    //   let usageFeatures: any[] = [];
    //   try {
    //     usageFeatures = JSON.parse(subMeta.usage_features as string);
    //   } catch (error: any) {
    //     console.log("Failed to parse usage features.", error.message);
    //     continue;
    //   }

    // }
  }
};
