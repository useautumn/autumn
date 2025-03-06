import { createStripeCli } from "@/external/stripe/utils.js";
import {
  getBillNowPrices,
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
import {
  getStripeSubItems,
  pricesToInvoiceItems,
} from "@/external/stripe/stripePriceUtils.js";

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

  // Cancel stripe subscription
  const stripeCli = createStripeCli({ org, env });

  for (const subId of curCusProduct.subscription_ids || []) {
    await stripeCli.subscriptions.cancel(subId, {
      prorate: true,
    });
  }
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
  const itemSets = await getStripeSubItems({
    attachParams,
  });

  let stripeSubs: Stripe.Subscription[] = [];
  for (const itemSet of itemSets) {
    const { items, subMeta } = itemSet;
    // Create subscription
    const stripeCli = createStripeCli({ org, env });
    const stripeSub = await stripeCli.subscriptions.create({
      customer: customer.processor.id,
      collection_method: "send_invoice",
      days_until_due: 30,
      items,
      metadata: subMeta,
    });
    stripeSubs.push(stripeSub);
  }

  // 1. Add full cus product
  console.log("   - Adding full cus product");
  await createFullCusProduct({
    sb: req.sb,
    attachParams,
    subscriptionId: stripeSubs[0].id,
    subscriptionIds: stripeSubs.map((s) => s.id),
    lastInvoiceId: stripeSubs[0].latest_invoice as string,
    collectionMethod: CollectionMethod.SendInvoice,
  });

  const stripeCli = createStripeCli({ org, env });
  let firstInvoice;
  for (const stripeSub of stripeSubs) {
    // Get stripe invoice
    console.log("   - Inserting stripe invoice into db");
    // 1. Finalize invoice
    await stripeCli.invoices.finalizeInvoice(
      stripeSub.latest_invoice as string
    );

    const stripeInvoice = await stripeCli.invoices.retrieve(
      stripeSub.latest_invoice as string
    );

    if (!firstInvoice) {
      firstInvoice = stripeInvoice;
    }

    try {
      await stripeCli.invoices.sendInvoice(stripeInvoice.id);
    } catch (error: any) {
      console.log("Failed to send stripe invoice:", error.message);
    }

    await InvoiceService.createInvoiceFromStripe({
      sb: req.sb,
      stripeInvoice,
      internalCustomerId: customer.internal_id,
      org,
      productIds: [product.id],
      internalProductIds: [product.internal_id],
    });
  }

  console.log("   ✅ Done");

  res.status(200).json({
    invoice_url: firstInvoice?.hosted_invoice_url,
  });
};
