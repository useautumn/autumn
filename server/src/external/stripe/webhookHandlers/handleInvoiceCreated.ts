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
  LoggerAction,
  Organization,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";
import {
  differenceInMinutes,
  differenceInSeconds,
  format,
  subDays,
} from "date-fns";
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
import { formatUnixToDateTime, generateId } from "@/utils/genUtils.js";
import {
  getMinCusEntBalance,
  getTotalNegativeBalance,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { getResetBalancesUpdate } from "@/internal/customers/entitlements/groupByUtils.js";
import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";
import {
  getLinkedCusEnt,
  getLinkedFromCusEnt,
} from "@/internal/customers/entitlements/linkedGroupUtils.js";

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

  // Check if linkedFrom cus ent
  const linkedFromCusEnt = getLinkedFromCusEnt({
    linkedToFeature: cusEnt.entitlement.feature,
    cusEnts,
  });

  if (!linkedFromCusEnt) {
    return;
  }

  console.log(
    `Linked from cus ent found, linked from: ${linkedFromCusEnt.entitlement.feature.id}, linked to: ${cusEnt.entitlement.feature.id}`
  );

  let removed = 0;
  let newBalances = structuredClone(linkedFromCusEnt?.balances)!;

  for (const id in linkedFromCusEnt?.balances) {
    let balanceObj = linkedFromCusEnt.balances[id];
    if (balanceObj.deleted) {
      console.log("Deleting balance:", id);
      delete newBalances[id];
      removed++;
    }
  }

  if (removed == 0) {
    console.log("No balances to remove");
  }

  let batchUpdate = [
    CustomerEntitlementService.update({
      sb,
      id: linkedFromCusEnt.id,
      updates: {
        balances: newBalances,
      },
    }),
    CustomerEntitlementService.update({
      sb,
      id: cusEnt.id,
      updates: {
        balance: cusEnt.balance! + removed,
      },
    }),
  ];

  await Promise.all(batchUpdate);

  console.log("Updated balances");
};

const handleUsageInArrear = async ({
  sb,
  invoice,
  customer,
  relatedCusEnt,
  stripeCli,
  price,
  usageSub,
  logger,
}: {
  sb: SupabaseClient;
  invoice: Stripe.Invoice;
  customer: Customer;
  relatedCusEnt: FullCustomerEntitlement;
  stripeCli: Stripe;
  price: Price;
  usageSub: Stripe.Subscription;
  logger: any;
}) => {
  let allowance = relatedCusEnt.entitlement.allowance!;
  let minBalance = getMinCusEntBalance({ cusEnt: relatedCusEnt });
  let config = price.config as UsagePriceConfig;

  // If relatedCusEnt's balance > 0 and next_reset_at is null, skip...
  if (relatedCusEnt.balance! > 0 && !relatedCusEnt.next_reset_at) {
    logger.info("Balance > 0 and next_reset_at is null, skipping");
    return;
  }

  if (!config.stripe_meter_id) {
    logger.warn(
      `Price ${price.id} has no stripe meter id, skipping invoice.created for usage in arrear`
    );
    return;
  }

  const totalNegativeBalance = getTotalNegativeBalance(relatedCusEnt);
  const finalBalance = Math.max(totalNegativeBalance, minBalance);
  const totalQuantity = new Decimal(allowance).minus(finalBalance).toNumber();
  const billingUnits = (price.config as UsagePriceConfig).billing_units || 1;
  const roundedQuantity =
    Math.ceil(new Decimal(totalQuantity).div(billingUnits).toNumber()) *
    billingUnits;

  const usageTimestamp = Math.round(
    subDays(new Date(invoice.created * 1000), 1).getTime() / 1000
  );

  // 1. Get stripe meter
  const stripeMeter = await stripeCli.billing.meters.retrieve(
    config.stripe_meter_id!
  );

  await stripeCli.billing.meterEvents.create({
    // event_name: price.id!,
    event_name: stripeMeter.event_name,
    payload: {
      stripe_customer_id: customer.processor.id,
      value: roundedQuantity.toString(),
    },
    timestamp: usageTimestamp,
  });

  let feature = relatedCusEnt.entitlement.feature;
  logger.info(
    `✅ Submitted meter event for customer ${customer.id}, feature: ${feature.id}, stripe event: ${stripeMeter.event_name}`
  );
  logger.info(
    `Allowance: ${allowance}, Min Balance: ${minBalance}, Quantity: ${totalQuantity}, Rounded: ${roundedQuantity}`
  );

  let invoiceCreatedStr = formatUnixToDateTime(invoice.created * 1000);
  let usageTimestampStr = formatUnixToDateTime(usageTimestamp * 1000);
  logger.info(
    `Invoice created: ${invoiceCreatedStr}, Usage timestamp: ${usageTimestampStr}`
  );

  // reset balance
  // TODO: If lifetime, reset to 0...
  let ent = relatedCusEnt.entitlement;
  let resetBalancesUpdate = getResetBalancesUpdate({
    cusEnt: relatedCusEnt,
    allowance: ent.interval == EntInterval.Lifetime ? 0 : ent.allowance!,
  });

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
  logger.info("✅ Successfully reset balance & adjustment");
};

export const sendUsageAndReset = async ({
  sb,
  activeProduct,
  org,
  env,
  invoice,
  stripeSubs,
  logger,
}: {
  sb: SupabaseClient;
  activeProduct: FullCusProduct;
  org: Organization;
  env: AppEnv;
  invoice: Stripe.Invoice;
  stripeSubs: Stripe.Subscription[];
  logger: any;
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
      billingType !== BillingType.UsageInArrear &&
      billingType !== BillingType.InArrearProrated
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

    // If trial just ended, skip
    if (usageBasedSub.trial_end == usageBasedSub.current_period_start) {
      logger.info(`Trial just ended, skipping usage invoice.created`);
      continue;
    }

    logger.info(
      `✨ Handling end of period usage for customer ${customer.name}, org: ${org.slug}`
    );
    logger.info(`   - Feature: ${relatedCusEnt.entitlement.feature.id}`);

    if (billingType == BillingType.UsageInArrear) {
      await handleUsageInArrear({
        sb,
        invoice,
        customer,
        relatedCusEnt,
        stripeCli,
        price,
        usageSub: usageBasedSub,
        logger,
      });
    } else if (billingType == BillingType.InArrearProrated) {
      await handleInArrearProrated({
        sb,
        cusEnts,
        cusPrice,
        customer,
        org,
        env,
        invoice,
        usageSub: usageBasedSub,
      });
    }
    // For regular end of period billing
  }
};

const invoiceCusProductCreatedDifference = ({
  invoice,
  cusProduct,
  minutes = 60,
}: {
  invoice: Stripe.Invoice;
  cusProduct: FullCusProduct;
  minutes?: number;
}) => {
  return (
    Math.abs(
      differenceInMinutes(
        new Date(cusProduct.created_at),
        new Date(invoice.created * 1000)
      )
    ) < minutes
  );
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
  const logger = createLogtailWithContext({
    org: org,
    invoice: invoice,
    action: LoggerAction.StripeWebhookInvoiceCreated,
  });

  // Get stripe subscriptions
  if (invoice.subscription) {
    const activeProducts = await CusProductService.getByStripeSubId({
      sb,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
      inStatuses: [CusProductStatus.Active, CusProductStatus.Expired],
    });

    if (activeProducts.length == 0) {
      logger.warn(
        `Stripe invoice.created -- no active products found (${org.slug})`
      );
      return;
    }

    const stripeSubs = await getStripeSubs({
      stripeCli: createStripeCli({ org, env }),
      subIds: activeProducts.map((p) => p.subscription_ids).flat(),
    });

    for (const activeProduct of activeProducts) {
      let invoiceCreatedRecently = invoiceCusProductCreatedDifference({
        invoice,
        cusProduct: activeProduct,
        minutes: 10,
      });

      if (invoiceCreatedRecently) {
        continue; // Skip this product but process others
      }

      await sendUsageAndReset({
        sb,
        activeProduct,
        org,
        env,
        stripeSubs,
        invoice,
        logger,
      });
    }
  }
};

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
