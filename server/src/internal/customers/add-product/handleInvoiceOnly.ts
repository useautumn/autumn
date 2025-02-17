import { createStripeSubscription } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import {
  getBillNowPrices,
  getStripeSubItems,
  pricesOnlyOneOff,
} from "@/internal/prices/priceUtils.js";
import { createFullCusProduct } from "./createFullCusProduct.js";
import { InvoiceService } from "../invoices/InvoiceService.js";
import {
  AppEnv,
  CollectionMethod,
  CusProduct,
  CusProductStatus,
  Customer,
  Organization,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { CusProductService } from "../products/CusProductService.js";
import Stripe from "stripe";
import { pricesToInvoiceItems } from "@/external/stripe/stripePriceUtils.js";

export const voidLatestInvoice = async ({
  stripeCli,
  subId,
}: {
  stripeCli: Stripe;
  subId: string;
}) => {
  // 1. Get sub
  const sub = await stripeCli.subscriptions.retrieve(subId);

  // 2. Void latest invoice?
  const invoice = await stripeCli.invoices.retrieve(
    sub.latest_invoice as string
  );

  if (invoice.status !== "paid") {
    await stripeCli.invoices.voidInvoice(sub.latest_invoice as string);
  }
};

export const removeCurrentProduct = async ({
  sb,
  customer,
  curCusProduct,
  org,
  env,
}: {
  sb: SupabaseClient;
  customer: Customer;
  curCusProduct: CusProduct;
  org: Organization;
  env: AppEnv;
}) => {
  console.log("   - Removing current product");
  // 1. Expire current product

  CusProductService.update({
    sb,
    cusProductId: curCusProduct.id,
    updates: {
      status: CusProductStatus.Expired,
    },
  });

  if (curCusProduct.processor?.subscription_id) {
    // Cancel stripe subscription
    const stripeCli = createStripeCli({ org, env });

    // TODO: If config.cancel unpaid invoice to upgrade
    // await voidLatestInvoice({
    //   stripeCli,
    //   subId: curCusProduct.processor.subscription_id,
    // });

    await stripeCli.subscriptions.cancel(
      curCusProduct.processor.subscription_id
    );
  }

  // 3. Void latest invoice (if exists...)
};

export const invoiceOnlyOneOff = async ({
  res,
  sb,
  attachParams,
}: {
  res: any;
  sb: SupabaseClient;
  attachParams: any;
}) => {
  // 1. Create stripe subscription (with invoice)

  const { org, env, customer, prices, product } = attachParams;

  const stripeCli = createStripeCli({ org, env });

  // Create invoice
  console.log("   - Creating stripe invoice");
  const invoice = await stripeCli.invoices.create({
    customer: customer.processor.id,
    collection_method: "send_invoice",
    days_until_due: 30,
  });

  // Add to invoice items
  await pricesToInvoiceItems({
    attachParams,
    stripeInvoiceId: invoice.id,
    sb,
    stripeCli,
  });

  // 2. Create full cus product
  console.log("   - Adding full cus product");
  await createFullCusProduct({
    sb,
    attachParams,
    collectionMethod: CollectionMethod.SendInvoice,
    lastInvoiceId: invoice.id,
  });

  // 3. Finalize invoice
  const finalizedInvoice = await stripeCli.invoices.finalizeInvoice(invoice.id);

  // 4. Create invoice from stripe
  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice: finalizedInvoice,
    internalCustomerId: customer.internal_id,
    org,
    productIds: [product.id],
    internalProductIds: [product.internal_id],
  });

  console.log("   ✅ Done");

  res.status(200).json({
    invoice_url: finalizedInvoice.hosted_invoice_url,
  });
};

export const handleInvoiceOnly = async ({
  req,
  res,
  attachParams,
  curCusProduct,
}: {
  req: any;
  res: any;
  attachParams: any;
  curCusProduct: any;
}) => {
  console.log("SCENARIO: INVOICE ONLY");
  const { org, env, customer, prices, product } = attachParams;

  // If current product, expire and cancel stripe subscription
  if (curCusProduct && !product.is_add_on) {
    // Handle removal of current product
  }

  // Handle one off prices
  if (pricesOnlyOneOff(prices)) {
    console.log("Handling one-off priced product (invoice only)");
    await invoiceOnlyOneOff({
      sb: req.sb,
      attachParams,
      res,
    });
    return;
  }

  // 1. Create stripe subscription (with invoice)
  console.log("   - Creating stripe subscription");
  const { items, itemMetas } = getStripeSubItems({
    attachParams,
  });

  // Create subscription
  const stripeCli = createStripeCli({ org, env });
  const stripeSub = await stripeCli.subscriptions.create({
    customer: customer.processor.id,
    items,
    collection_method: "send_invoice",
    days_until_due: 30,
  });

  // 1. Add full cus product
  console.log("   - Adding full cus product");
  await createFullCusProduct({
    sb: req.sb,
    attachParams,
    subscriptionId: stripeSub.id,
    lastInvoiceId: stripeSub.latest_invoice as string,
    collectionMethod: CollectionMethod.SendInvoice,
  });

  // Get stripe invoice
  console.log("   - Inserting stripe invoice into db");
  // 1. Finalize invoice
  await stripeCli.invoices.finalizeInvoice(stripeSub.latest_invoice as string);
  const stripeInvoice = await stripeCli.invoices.retrieve(
    stripeSub.latest_invoice as string
  );

  await InvoiceService.createInvoiceFromStripe({
    sb: req.sb,
    stripeInvoice,
    internalCustomerId: customer.internal_id,
    org,
    productIds: [product.id],
    internalProductIds: [product.internal_id],
  });

  console.log("   ✅ Done");

  res.status(200).json({
    invoice_url: stripeInvoice.hosted_invoice_url,
  });
};
