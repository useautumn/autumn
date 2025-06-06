import { DrizzleCli } from "@/db/initDrizzle.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { BillingType, FullCusProduct } from "@autumn/shared";
import Stripe from "stripe";
import { getContUseInvoiceItems } from "./getContUseInvoiceItems.js";
import { findPriceInStripeItems } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";

export const createAndFilterContUseItems = async ({
  attachParams,
  curMainProduct,
  stripeSubs,
  latestInvoice,
  logger,
}: {
  attachParams: AttachParams;
  curMainProduct: FullCusProduct;
  stripeSubs: Stripe.Subscription[];
  latestInvoice: Stripe.Invoice;
  logger: any;
}) => {
  let { newItems, oldItems, replaceables } = await getContUseInvoiceItems({
    attachParams,
    cusProduct: curMainProduct!,
    stripeSubs,
    logger,
  });

  const { stripeCli, customer, org } = attachParams;

  const curPrices = cusProductToPrices({
    cusProduct: curMainProduct,
  });
  const latestInvoiceItems = await stripeCli.invoices.listUpcomingLines({
    subscription: stripeSubs[0].id,
  });

  for (const item of latestInvoiceItems.data) {
    let price = findPriceInStripeItems({
      prices: curPrices,
      subItem: item as any,
      billingType: BillingType.InArrearProrated,
    });

    if (!price) continue;

    logger.info(`Deleting item: ${item.description}, ${item.amount}`);
    try {
      await stripeCli.invoiceItems.del(item.id);
    } catch (error) {
      logger.error(`Failed to delete: ${error}`);
    }
  }
  return;

  const items = [...oldItems, ...newItems];
  for (const item of items) {
    if (!item.amount || item.amount === 0) {
      continue;
    }
    logger.info(
      `Adding invoice item: ${item.description}, ${item.description}`,
    );
  }

  for (const item of items) {
    if (!item.amount || item.amount === 0) {
      continue;
    }

    await stripeCli.invoiceItems.create({
      customer: customer.processor?.id!,
      amount: Math.round(item.amount * 100),
      description: item.description,
      currency: org.default_currency || "usd",
    });
  }

  return { newItems, oldItems, replaceables };
};
