import { DrizzleCli } from "@/db/initDrizzle.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { FullCusProduct } from "@autumn/shared";
import Stripe from "stripe";
import {
  createUsageInvoiceItems,
  resetUsageBalances,
} from "./createUsageInvoiceItems.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";

export const createUsageInvoice = async ({
  db,
  attachParams,
  cusProduct,
  stripeSubs,
  logger,
}: {
  db: DrizzleCli;
  attachParams: AttachParams;
  cusProduct: FullCusProduct;
  stripeSubs: Stripe.Subscription[];
  logger: any;
}) => {
  const { stripeCli, paymentMethod } = attachParams;
  const customer = cusProduct.customer!;
  const invoice = await stripeCli.invoices.create({
    customer: customer.processor.id,
    auto_advance: false,
  });

  const { cusEntIds } = await createUsageInvoiceItems({
    db,
    attachParams,
    cusProduct,
    stripeSubs,
    invoiceId: invoice.id,
    logger,
  });

  await stripeCli.invoices.finalizeInvoice(invoice.id, {
    auto_advance: false,
  });

  const {
    paid,
    error,
    invoice: latestInvoice,
  } = await payForInvoice({
    stripeCli,
    paymentMethod,
    invoiceId: invoice.id,
    logger,
    errorOnFail: false,
  });

  if (latestInvoice) {
    await resetUsageBalances({
      db,
      cusEntIds,
      cusProduct,
    });

    await insertInvoiceFromAttach({
      db,
      invoiceId: latestInvoice.id,
      attachParams,
      logger,
    });
  }

  if (!paid) {
    logger.error(`sub.deleted, failed to pay invoice: ${invoice.id}`, {
      error,
    });
  }

  return invoice;
};
