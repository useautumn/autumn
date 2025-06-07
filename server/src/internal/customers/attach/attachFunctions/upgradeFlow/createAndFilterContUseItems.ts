import { DrizzleCli } from "@/db/initDrizzle.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
  BillingInterval,
  BillingType,
  FullCusProduct,
  FullProduct,
} from "@autumn/shared";
import Stripe from "stripe";
import { getContUseInvoiceItems } from "./getContUseInvoiceItems.js";
import { findPriceInStripeItems } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { attachParamsToProduct } from "../../attachUtils/convertAttachParams.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";

export const filterContUsageProrations = async ({
  sub,
  stripeCli,
  curCusProduct,
  newProduct,
  logger,
}: {
  sub: Stripe.Subscription;
  stripeCli: Stripe;
  curCusProduct: FullCusProduct;
  newProduct: FullProduct;
  logger: any;
}) => {
  const curPrices = cusProductToPrices({
    cusProduct: curCusProduct,
  });
  let allPrices = [...curPrices, ...newProduct.prices];

  const upcomingLines = await stripeCli.invoices.listUpcomingLines({
    subscription: sub.id,
  });
  logger.info(
    `Filtering cont use prorated items, interval: ${subToAutumnInterval(sub)}`,
  );

  for (const item of upcomingLines.data) {
    if (!item.proration) continue;

    let price = findPriceInStripeItems({
      prices: allPrices,
      subItem: item as any,
      billingType: BillingType.InArrearProrated,
    });

    logger.info(`Invoice: ${item.description}, ${item.amount}`);
    if (!price) continue;
    logger.info(`Deleting!`);

    await stripeCli.invoiceItems.del(
      // @ts-ignore -- Stripe types are not correct
      item.parent.subscription_item_details.invoice_item,
    );
  }
};

export const createAndFilterContUseItems = async ({
  attachParams,
  curMainProduct,
  stripeSubs,
  logger,
  interval,
}: {
  attachParams: AttachParams;
  curMainProduct: FullCusProduct;
  stripeSubs: Stripe.Subscription[];
  logger: any;
  interval?: BillingInterval;
}) => {
  let { newItems, oldItems, replaceables } = await getContUseInvoiceItems({
    attachParams,
    cusProduct: curMainProduct!,
    stripeSubs,
    logger,
  });

  const { stripeCli, customer, org } = attachParams;

  const product = attachParamsToProduct({ attachParams });

  let sub = interval
    ? stripeSubs.find((sub) => subToAutumnInterval(sub) == interval)
    : stripeSubs[0];

  if (!sub) {
    throw new Error(
      `createAndFilterContUseItems: No sub found for interval ${interval}`,
    );
  }

  await filterContUsageProrations({
    sub,
    stripeCli,
    curCusProduct: curMainProduct,
    newProduct: product,
    logger,
  });

  const items = [...oldItems, ...newItems];

  for (const item of items) {
    if (!item.amount || item.amount === 0) {
      continue;
    }

    let price = product.prices.find((p) => p.id === item.price_id);

    if (interval && price?.config.interval !== interval) {
      continue;
    }

    logger.info(
      `Adding invoice item: ${item.description}, ${item.description}, interval: ${interval}`,
    );

    await stripeCli.invoiceItems.create({
      customer: customer.processor?.id!,
      amount: Math.round(item.amount * 100),
      description: item.description,
      currency: org.default_currency || "usd",
      subscription: sub.id,
    });
  }

  return { newItems, oldItems, replaceables };
};
