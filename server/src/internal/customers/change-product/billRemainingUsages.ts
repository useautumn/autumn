import { Stripe } from "stripe";
import { AttachParams } from "../cusProducts/AttachParams.js";
import { FullCusProduct, InvoiceItem } from "@autumn/shared";
import { BillingInterval, BillingType, UsagePriceConfig } from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
  getBillingType,
  getPriceForOverage,
} from "@/internal/products/prices/priceUtils.js";
import {
  createStripeCli,
  subToAutumnInterval,
} from "@/external/stripe/utils.js";
import { CusEntService } from "../cusProducts/cusEnts/CusEntitlementService.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";

import { stripeToAutumnInterval } from "@/external/stripe/utils.js";
import { getResetBalancesUpdate } from "../cusProducts/cusEnts/groupByUtils.js";
import {
  getCusPriceUsage,
  getRelatedCusEnt,
} from "../cusProducts/cusPrices/cusPriceUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import {
  AttachConfig,
  ProrationBehavior,
} from "../attach/models/AttachFlags.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";

// Add usage to end of cycle
const addUsageToNextInvoice = async ({
  db,
  intervalToInvoiceItems,
  intervalToSub,
  customer,
  org,
  logger,
  attachParams,
}: {
  db: DrizzleCli;
  intervalToInvoiceItems: any;
  intervalToSub: any;
  customer: any;
  org: any;
  logger: any;
  attachParams: AttachParams;
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
      const { amount, description } = item;

      logger.info(
        `   feature: ${item.feature.id}, overage: ${item.overage}, amount: ${amount}`,
      );

      let relatedSub = intervalToSub[interval];
      if (!relatedSub) {
        continue;
      }

      // Create invoice item
      let invoiceItem = {
        customer: customer.processor.id,
        currency: org.default_currency,
        description,
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
      await CusEntService.update({
        db,
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
  db,
  intervalToInvoiceItems,
  customer,
  org,
  logger,
  curCusProduct,
  attachParams,
  newSubs,
}: {
  db: DrizzleCli;
  intervalToInvoiceItems: any;
  customer: any;
  org: any;
  logger: any;
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
      newSubs[0].latest_invoice as string,
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
    // const amount = getPriceForOverage(item.price, item.overage);
    const { amount, description } = item;
    let config = item.price.config! as UsagePriceConfig;
    let stripePrice = await stripeCli.prices.retrieve(config.stripe_price_id!);

    logger.info(
      `🌟🌟🌟 (Bill remaining) created invoice item: ${description} -- ${amount}`,
    );

    let invoiceItem = {
      customer: customer.processor.id,
      invoice: invoice.id,
      currency: org.default_currency,
      description,
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

    await CusEntService.update({
      db,
      id: item.relatedCusEnt!.id,
      updates: {
        balance: 0,
      },
    });
    let index = curCusProduct.customer_entitlements.findIndex(
      (ce) => ce.id === item.relatedCusEnt!.id,
    );

    curCusProduct.customer_entitlements[index] = {
      ...curCusProduct.customer_entitlements[index],
      balance: 0,
    };
  }

  if (newInvoice) {
    await stripeCli.invoices.finalizeInvoice(invoice.id);

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
  }

  await insertInvoiceFromAttach({
    db,
    attachParams,
    invoiceId: invoice.id,
    logger,
  });
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
  db,
  logger,
  attachParams,
  curCusProduct,
  newSubs,
  shouldPreview = false,
  billImmediately = false,
}: {
  db: DrizzleCli;
  logger: any;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
  newSubs: Stripe.Subscription[];
  shouldPreview?: boolean;
  billImmediately?: boolean;
}) => {
  const { customer_prices, customer_entitlements } = curCusProduct;
  const { customer, org } = attachParams;

  const intervalToSub: any = {};

  for (const sub of newSubs) {
    const interval = subToAutumnInterval(sub);
    if (interval) {
      intervalToSub[interval] = sub;
    }
  }

  const intervalToInvoiceItems: any = {};
  const stripeCli = createStripeCli({
    org: org,
    env: customer.env,
  });

  for (const cp of customer_prices) {
    const config = cp.price.config! as UsagePriceConfig;
    const relatedCusEnt = getRelatedCusEnt({
      cusPrice: cp,
      cusEnts: customer_entitlements,
    });
    const billingType = getBillingType(config);

    if (billingType !== BillingType.UsageInArrear) continue;

    const { usage, overage, description, amount } = getCusPriceUsage({
      cusPrice: cp,
      cusProduct: curCusProduct,
      logger,
    });

    if (overage <= 0) continue; // no overage, no need to bill...

    let interval = config.interval as BillingInterval;
    if (!intervalToInvoiceItems[interval]) {
      intervalToInvoiceItems[interval] = [];
    }

    let sub = intervalToSub[interval];

    const stripeNow = await getStripeNow({
      stripeCli,
      stripeSub: sub,
    });

    intervalToInvoiceItems[interval].push({
      overage,
      usage,
      description,
      amount,

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

  if (billImmediately) {
    await invoiceForUsageImmediately({
      db,
      intervalToInvoiceItems,
      customer,
      org,
      logger,
      curCusProduct,
      attachParams,
      newSubs,
    });
  } else {
    await addUsageToNextInvoice({
      db,
      intervalToInvoiceItems,
      intervalToSub,
      customer,
      org,
      logger,
      attachParams,
    });
  }
};
