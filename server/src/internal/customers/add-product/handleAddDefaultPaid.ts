import { SupabaseClient } from "@supabase/supabase-js";
import { AttachParams } from "../products/AttachParams.js";
import { BillingInterval } from "@autumn/shared";
import Stripe from "stripe";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeExpandedInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import {
  attachToInsertParams,
  initProductInStripe,
} from "@/internal/products/productUtils.js";
import { InvoiceService } from "../invoices/InvoiceService.js";
import { createFullCusProduct } from "./createFullCusProduct.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeSubThroughInvoice } from "@/external/stripe/stripeInvoiceSubUtils.js";

// export const handleAddDefaultPaid = async ({
//   sb,
//   attachParams,
//   logger,
// }: {
//   sb: SupabaseClient;
//   attachParams: AttachParams;
//   logger: any;
// }) => {
//   const { org, customer, products, freeTrial } = attachParams;
//   const product = products[0];

//   // 1. Create stripe customer if not exists
//   await Promise.all([
//     createStripeCusIfNotExists({
//       sb,
//       org,
//       env: customer.env,
//       customer,
//       logger,
//     }),
//     initProductInStripe({
//       sb,
//       org,
//       env: customer.env,
//       product,
//       logger,
//     }),
//   ]);

//   const stripeCli = createStripeCli({ org, env: customer.env });

//   let itemSets = await getStripeSubItems({
//     attachParams,
//   });

//   let subscriptions: Stripe.Subscription[] = [];
//   let invoiceIds: string[] = [];

//   for (const itemSet of itemSets) {
//     if (itemSet.interval === BillingInterval.OneOff) {
//       continue;
//     }

//     const { items } = itemSet;

//     try {
//       // Should create 2 subscriptions
//       let subscription = await createStripeSubThroughInvoice({
//         stripeCli,
//         customer,
//         org,
//         items,
//         freeTrial,
//         metadata: itemSet.subMeta,
//         prices: itemSet.prices,
//       });

//       subscriptions.push(subscription);
//       invoiceIds.push(subscription.latest_invoice as string);
//     } catch (error: any) {
//       throw error;
//     }
//   }

//   // Add product and entitlements to customer
//   const batchInsert = [];
//   for (const product of products) {
//     batchInsert.push(
//       createFullCusProduct({
//         sb,
//         attachParams: attachToInsertParams(attachParams, product),
//         subscriptionIds: subscriptions.map((s) => s.id),
//         subscriptionId:
//           subscriptions.length > 0 ? subscriptions[0].id : undefined,
//       })
//     );
//   }
//   await Promise.all(batchInsert);

//   for (const invoiceId of invoiceIds) {
//     try {
//       const invoice = await getStripeExpandedInvoice({
//         stripeCli,
//         stripeInvoiceId: invoiceId,
//       });

//       await InvoiceService.createInvoiceFromStripe({
//         sb,
//         stripeInvoice: invoice,
//         internalCustomerId: customer.internal_id,
//         productIds: products.map((p) => p.id),
//         internalProductIds: products.map((p) => p.internal_id),
//         org,
//       });
//     } catch (error) {
//       logger.error("handleBillNowPrices: error retrieving invoice", error);
//     }
//   }
// };
