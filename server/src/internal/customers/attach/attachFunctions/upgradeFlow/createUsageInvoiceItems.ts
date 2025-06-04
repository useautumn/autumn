import { DrizzleCli } from "@/db/initDrizzle.js";
import { getUsageBasedSub } from "@/external/stripe/stripeSubUtils.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import {
  getCusPriceUsage,
  getRelatedCusEnt,
} from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import {
  cusProductsToCusPrices,
  cusProductToCusEnts,
  cusProductToEnts,
} from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { FullCusProduct, UsagePriceConfig, BillingType } from "@autumn/shared";

import Stripe from "stripe";

export const getUsageInvoiceItems = async ({
  db,
  logger,
  attachParams,
  cusProduct,
  stripeSubs,
}: {
  db: DrizzleCli;
  logger: any;
  attachParams: AttachParams;
  cusProduct: FullCusProduct;
  stripeSubs: Stripe.Subscription[];
}) => {
  const { stripeCli, org } = attachParams;

  const cusPrices = cusProductsToCusPrices({
    cusProducts: [cusProduct],
  });
  // const ents = cusProductToEnts({ cusProduct });
  const cusEnts = cusProductToCusEnts([cusProduct]);

  const invoiceItems: any[] = [];
  const cusEntIds: string[] = [];

  for (const cusPrice of cusPrices) {
    const config = cusPrice.price.config! as UsagePriceConfig;
    const billingType = getBillingType(config);

    if (billingType !== BillingType.UsageInArrear) continue;

    const { usage, overage, description, amount } = getCusPriceUsage({
      cusPrice,
      cusProduct,
      logger,
    });

    if (amount <= 0) continue;

    const cusEnt = getRelatedCusEnt({ cusPrice, cusEnts })!;

    const sub = await getUsageBasedSub({
      db,
      stripeCli,
      stripeSubs,
      subIds: cusProduct.subscription_ids!,
      feature: cusEnt.entitlement.feature,
    });

    if (!sub) continue;

    cusEntIds.push(cusEnt.id);

    let invoiceItem = {
      description,
      price_data: {
        product: config.stripe_product_id!,
        unit_amount: Math.round(amount * 100),
        currency: org.default_currency || "usd",
      },
      period: {
        start: sub.current_period_start,
        end: Math.floor((attachParams.now || Date.now()) / 1000),
      },
    };

    invoiceItems.push(invoiceItem);
  }

  return {
    invoiceItems,
    cusEntIds,
  };
};

export const createUsageInvoiceItems = async ({
  db,
  attachParams,
  cusProduct,
  stripeSubs,
  invoiceId,
  logger,
}: {
  db: DrizzleCli;
  attachParams: AttachParams;
  cusProduct: FullCusProduct;
  stripeSubs: Stripe.Subscription[];
  invoiceId?: string;
  logger: any;
}) => {
  const { stripeCli } = attachParams;
  const { invoiceItems, cusEntIds } = await getUsageInvoiceItems({
    db,
    attachParams,
    cusProduct,
    stripeSubs,
    logger,
  });

  const batchCreate = [];
  for (let i = 0; i < invoiceItems.length; i++) {
    const invoiceItem = invoiceItems[i];
    const createInvoiceItem = async () => {
      logger.info(
        `🌟 Creating usage invoice item: ${invoiceItem.description}, amount: ${invoiceItem.price_data.unit_amount}`,
      );

      await stripeCli.invoiceItems.create({
        ...invoiceItem,
        invoice: invoiceId ? invoiceId : undefined,
        subscription: invoiceId ? undefined : stripeSubs[0].id,
        customer: attachParams.customer.processor.id,
      });
    };

    batchCreate.push(createInvoiceItem());
  }
  await Promise.all(batchCreate);

  return {
    invoiceItems,
    cusEntIds,
  };
};

export const resetUsageBalances = async ({
  db,
  cusEntIds,
  cusProduct,
}: {
  db: DrizzleCli;
  cusEntIds: string[];
  cusProduct: FullCusProduct;
}) => {
  for (const cusEntId of cusEntIds) {
    await CusEntService.update({
      db,
      id: cusEntId,
      updates: {
        balance: 0,
      },
    });

    let index = cusProduct.customer_entitlements.findIndex(
      (ce) => ce.id === cusEntId,
    );

    cusProduct.customer_entitlements[index] = {
      ...cusProduct.customer_entitlements[index],
      balance: 0,
    };
  }
};
