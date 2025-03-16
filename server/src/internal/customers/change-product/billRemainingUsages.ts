import { SupabaseClient } from "@supabase/supabase-js";
import { Stripe } from "stripe";
import { AttachParams } from "../products/AttachParams.js";
import { FullCusProduct } from "@autumn/shared";
import {
  BillingInterval,
  BillingType,
  CusEntWithEntitlement,
  ErrCode,
  UsagePriceConfig,
} from "@autumn/shared";
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

  // const invoice = await stripeCli.invoices.create({
  //   customer: customer.processor.id,
  //   auto_advance: true,
  // });
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

  // 2. Add items to invoice
  let invoiceItems = Object.values(intervalToInvoiceItems).flat() as any[];
  if (invoiceItems.length === 0) {
    return;
  }

  for (const item of invoiceItems) {
    const amount = getPriceForOverage(item.price, item.overage);

    logger.info(
      `   feature: ${item.feature.id}, overage: ${item.overage}, amount: ${amount}`
    );

    let invoiceItem = {
      customer: customer.processor.id,
      invoice: invoice.id,
      currency: org.default_currency,
      description: `${curCusProduct.product.name} - ${
        item.feature.name
      } x ${Math.round(item.usage)}`,
      price_data: {
        product: (item.price.config! as UsagePriceConfig).stripe_product_id!,
        unit_amount: Math.round(amount * 100),
        currency: org.default_currency,
      },
    };

    await stripeCli.invoiceItems.create(invoiceItem);

    // // Set cus ent to 0
    await CustomerEntitlementService.update({
      sb,
      id: item.relatedCusEnt!.id,
      updates: {
        balance: 0,
      },
    });
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
      org: org,
      productIds: [curProduct.id],
      internalProductIds: [curProduct.internal_id],
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

    // TODO: Send revenue event
  }

  // if (!attachParams.invoiceOnly) {
  //   const { paid, error } = await payForInvoice({
  //     fullOrg: org,
  //     env: customer.env,
  //     customer,
  //     invoice: finalizedInvoice,
  //     logger,
  //   });

  //   if (!paid) {
  //     return;
  //     // await stripeCli.invoices.voidInvoice(invoice.id);
  //     // throw new RecaseError({
  //     //   message: "Failed to pay invoice for remaining usages",
  //     //   code: ErrCode.PayInvoiceFailed,
  //     //   statusCode: StatusCodes.BAD_REQUEST,
  //     // });
  //   }
  // }
};

export const billForRemainingUsages = async ({
  logger,
  sb,
  attachParams,
  curCusProduct,
  newSubs,
}: {
  logger: any;
  sb: SupabaseClient;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
  newSubs: Stripe.Subscription[];
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
  // let itemsToInvoice = [];
  for (const cp of customer_prices) {
    let config = cp.price.config! as UsagePriceConfig;
    let relatedCusEnt = customer_entitlements.find(
      (cusEnt) =>
        cusEnt.entitlement.internal_feature_id === config.internal_feature_id
    );

    if (
      getBillingType(config) !== BillingType.UsageInArrear ||
      !relatedCusEnt ||
      !relatedCusEnt.usage_allowed ||
      !relatedCusEnt.balance ||
      relatedCusEnt?.balance > 0
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

    intervalToInvoiceItems[interval].push({
      overage,
      usage,
      feature: relatedCusEnt?.entitlement.feature,
      price: cp.price,
      relatedCusEnt,
    });
  }

  console.log("BILL UPGRADE IMMEDIATELY", org.config?.bill_upgrade_immediately);

  if (org.config?.bill_upgrade_immediately) {
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
