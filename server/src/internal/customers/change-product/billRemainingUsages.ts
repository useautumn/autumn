import { SupabaseClient } from "@supabase/supabase-js";
import { Stripe } from "stripe";
import { AttachParams } from "../products/AttachParams.js";
import { FullCusProduct, InvoiceItem } from "@autumn/shared";
import { BillingInterval, BillingType, UsagePriceConfig } from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
  getBillingType,
  getPriceForOverage,
} from "@/internal/prices/priceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CustomerEntitlementService } from "../entitlements/CusEntitlementService.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { getInvoiceExpansion } from "@/external/stripe/stripeInvoiceUtils.js";

import { InvoiceService } from "../invoices/InvoiceService.js";
import { stripeToAutumnInterval } from "@/external/stripe/utils.js";
import { getResetBalancesUpdate } from "../entitlements/groupByUtils.js";
import { getRelatedCusEnt } from "../prices/cusPriceUtils.js";

// Add usage to end of cycle
const addUsageToNextInvoice = async ({
  intervalToInvoiceItems,
  intervalToSub,
  customer,
  org,
  logger,
  sb,
  attachParams,
  curCusProduct,
}: {
  intervalToInvoiceItems: any;
  intervalToSub: any;
  customer: any;
  org: any;
  logger: any;
  sb: SupabaseClient;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
}) => {
  for (const interval in intervalToInvoiceItems) {
    const itemsToInvoice = intervalToInvoiceItems[interval];

    if (itemsToInvoice.length === 0) {
      continue;
    }

    // Add items to invoice
    const stripeCli = createStripeCli({
      org: org,
      env: customer.env,
    });

    for (const item of itemsToInvoice) {
      const amount = getPriceForOverage(item.price, item.overage);

      logger.info(
        `   feature: ${item.feature.id}, overage: ${item.overage}, amount: ${amount}`
      );

      let relatedSub = intervalToSub[interval];
      if (!relatedSub) {
        logger.error(
          `No sub found for interval: ${interval}, for feature: ${item.feature.id}`
        );

        // Invoice immediately?
        continue;
      }

      // Create invoice item
      let invoiceItem = {
        customer: customer.processor.id,
        currency: org.default_currency,
        description: `${curCusProduct.product.name} - ${
          item.feature.name
        } x ${Math.round(item.usage)}`,
        price_data: {
          product: (item.price.config! as UsagePriceConfig).stripe_product_id!,
          unit_amount: Math.round(amount * 100),
          currency: org.default_currency,
        },
        subscription: relatedSub.id,
        period: {
          start: item.periodStart,
          end: item.periodEnd,
        },
      };

      await stripeCli.invoiceItems.create(invoiceItem);

      // Update cus ent to 0
      await CustomerEntitlementService.update({
        sb,
        id: item.relatedCusEnt!.id,
        updates: getResetBalancesUpdate({
          cusEnt: item.relatedCusEnt!,
          allowance: 0,
        }),
      });

      // Update existing cusEnt in attachParams
      let cusProducts = attachParams.cusProducts;
      for (const cusProduct of cusProducts!) {
        for (let i = 0; i < cusProduct.customer_entitlements.length; i++) {
          let cusEnt = cusProduct.customer_entitlements[i];
          if (cusEnt.id === item.relatedCusEnt!.id) {
            let balancesUpdate = getResetBalancesUpdate({
              cusEnt,
              allowance: 0,
            });
            cusProduct.customer_entitlements[i] = {
              ...cusEnt,
              ...balancesUpdate,
            };
          }
        }
      }
    }
  }
};

const invoiceForUsageImmediately = async ({
  intervalToInvoiceItems,
  customer,
  org,
  logger,
  sb,
  curCusProduct,
  attachParams,
  newSubs,
}: {
  intervalToInvoiceItems: any;
  customer: any;
  org: any;
  logger: any;
  sb: SupabaseClient;
  curCusProduct: FullCusProduct;
  attachParams: AttachParams;
  newSubs: Stripe.Subscription[];
}) => {
  // 1. Create invoice
  const stripeCli = createStripeCli({
    org: org,
    env: customer.env,
  });

  await new Promise((resolve) => setTimeout(resolve, 5000));

  let invoiceItems = Object.values(intervalToInvoiceItems).flat() as any[];
  if (invoiceItems.length === 0) {
    return;
  }

  let invoice: Stripe.Invoice;
  let newInvoice = false;
  if (attachParams.invoiceOnly && newSubs.length > 0) {
    invoice = await stripeCli.invoices.retrieve(
      newSubs[0].latest_invoice as string
    );

    if (invoice.status !== "draft") {
      newInvoice = true;
      invoice = await stripeCli.invoices.create({
        customer: customer.processor.id,
        auto_advance: true,
      });
    }
  } else {
    newInvoice = true;

    invoice = await stripeCli.invoices.create({
      customer: customer.processor.id,
      auto_advance: true,
    });
  }

  let autumnInvoiceItems: InvoiceItem[] = [];

  for (const item of invoiceItems) {
    const amount = getPriceForOverage(item.price, item.overage);
    let config = item.price.config! as UsagePriceConfig;

    // TO TEST
    let stripePrice = await stripeCli.prices.retrieve(config.stripe_price_id!);
    let description = `${curCusProduct.product.name} - ${
      item.feature.name
    } x ${Math.round(item.usage)}`;

    logger.info(
      `🌟🌟🌟 (Bill remaining) created invoice item: ${description} -- ${amount}`
    );

    let invoiceItem = {
      customer: customer.processor.id,
      invoice: invoice.id,
      currency: org.default_currency,
      description: description,
      price_data: {
        product: stripePrice.product as string,
        unit_amount: Math.round(amount * 100),
        currency: org.default_currency,
      },
      period: {
        start: item.periodStart,
        end: item.periodEnd,
      },
    };

    let stripeInvoiceItem = await stripeCli.invoiceItems.create(invoiceItem);

    autumnInvoiceItems.push({
      price_id: item.price.id!,
      internal_feature_id: item.feature.internal_id || null,
      description: description,
      period_start: item.periodStart * 1000,
      period_end: item.periodEnd * 1000,
      stripe_id: stripeInvoiceItem.id,
    });

    await CustomerEntitlementService.update({
      sb,
      id: item.relatedCusEnt!.id,
      updates: {
        balance: 0,
      },
    });
    let index = curCusProduct.customer_entitlements.findIndex(
      (ce) => ce.id === item.relatedCusEnt!.id
    );

    curCusProduct.customer_entitlements[index] = {
      ...curCusProduct.customer_entitlements[index],
      balance: 0,
    };
  }

  // Finalize and pay invoice
  const finalizedInvoice = await stripeCli.invoices.finalizeInvoice(
    invoice.id,
    getInvoiceExpansion()
  );

  let curProduct = curCusProduct.product;

  if (newInvoice) {
    await InvoiceService.createInvoiceFromStripe({
      sb,
      stripeInvoice: finalizedInvoice,
      internalCustomerId: customer.internal_id,
      internalEntityId: curCusProduct.internal_entity_id || undefined,
      org: org,
      productIds: [curProduct.id],
      internalProductIds: [curProduct.internal_id],
      items: autumnInvoiceItems,
    });

    const { paid, error } = await payForInvoice({
      fullOrg: org,
      env: customer.env,
      customer,
      invoice,
      logger,
    });

    if (!paid) {
      logger.warn("Failed to pay invoice for remaining usages", {
        stripeInvoice: newInvoice,
        paymentError: error,
      });
    }
  } else {
    // Update invoice
    await InvoiceService.updateByStripeId({
      sb,
      stripeInvoiceId: invoice.id,
      updates: {
        total: Number((finalizedInvoice.total / 100).toFixed(2)),
      },
    });
  }
};

const getRemainingUsagesPreview = async ({
  intervalToInvoiceItems,
  curCusProduct,
}: {
  intervalToInvoiceItems: any;
  curCusProduct: FullCusProduct;
}) => {
  let invoiceItems = Object.values(intervalToInvoiceItems).flat() as any[];
  if (invoiceItems.length === 0) {
    return;
  }

  let items = [];
  for (const item of invoiceItems) {
    const amount = getPriceForOverage(item.price, item.overage);
    const description = `${curCusProduct.product.name} - ${
      item.feature.name
    } x ${Math.round(item.usage)}`;

    items.push({
      amount,
      description,
    });
  }

  return items;
};

export const billForRemainingUsages = async ({
  logger,
  sb,
  attachParams,
  curCusProduct,
  newSubs,
  shouldPreview = false,
  bilImmediatelyOverride = false,
}: {
  logger: any;
  sb: any;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
  newSubs: Stripe.Subscription[];
  shouldPreview?: boolean;
  bilImmediatelyOverride?: boolean;
}) => {
  const { customer_prices, customer_entitlements } = curCusProduct;
  const { customer, org } = attachParams;

  const intervalToSub: any = {};
  for (const sub of newSubs) {
    let recurring = sub.items.data[0].price.recurring;
    if (!recurring) {
      continue;
    }
    const interval = stripeToAutumnInterval({
      interval: recurring.interval,
      intervalCount: recurring.interval_count,
    });
    if (interval) {
      intervalToSub[interval] = sub;
    }
  }

  // Get usage based prices
  const intervalToInvoiceItems: any = {};
  const stripeCli = createStripeCli({
    org: org,
    env: customer.env,
  });
  for (const cp of customer_prices) {
    let config = cp.price.config! as UsagePriceConfig;
    let relatedCusEnt = getRelatedCusEnt({
      cusPrice: cp,
      cusEnts: customer_entitlements,
    });

    if (
      getBillingType(config) !== BillingType.UsageInArrear ||
      !relatedCusEnt ||
      !relatedCusEnt.usage_allowed ||
      !relatedCusEnt.balance ||
      relatedCusEnt.balance > 0
    ) {
      continue;
    }

    // Amount to bill?
    let usage = new Decimal(relatedCusEnt?.entitlement.allowance!)
      .minus(relatedCusEnt?.balance!)
      .toNumber();

    let overage = -relatedCusEnt?.balance!;

    let interval = config.interval as BillingInterval;
    if (!intervalToInvoiceItems[interval]) {
      intervalToInvoiceItems[interval] = [];
    }

    let sub = intervalToSub[interval];

    let stripeNow = Math.floor(Date.now() / 1000);
    if (sub.test_clock) {
      let stripeClock = await stripeCli.testHelpers.testClocks.retrieve(
        sub.test_clock
      );
      stripeNow = stripeClock.frozen_time;
    }

    intervalToInvoiceItems[interval].push({
      overage,
      usage,
      feature: relatedCusEnt?.entitlement.feature,
      price: cp.price,
      relatedCusEnt,
      periodStart: sub?.current_period_start,
      periodEnd: stripeNow,
    });
  }

  if (shouldPreview) {
    return getRemainingUsagesPreview({
      intervalToInvoiceItems,
      curCusProduct,
    });
  }

  if (org.config?.bill_upgrade_immediately || bilImmediatelyOverride) {
    await invoiceForUsageImmediately({
      intervalToInvoiceItems,
      customer,
      org,
      logger,
      sb,
      curCusProduct,
      attachParams,
      newSubs,
    });
  } else {
    await addUsageToNextInvoice({
      intervalToInvoiceItems,
      intervalToSub,
      customer,
      org,
      logger,
      sb,
      attachParams,
      curCusProduct,
    });
  }
};
