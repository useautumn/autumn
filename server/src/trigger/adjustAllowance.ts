import {
  Entitlement,
  FullCusEntWithFullCusProduct,
  FullCusEntWithProduct,
  Price,
} from "@autumn/shared";
import {
  AppEnv,
  BillingType,
  Customer,
  Feature,
  FullCustomerPrice,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";

import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { getUsageBasedSub } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { Decimal } from "decimal.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { handleProratedUpgrade } from "./arrearProratedUsage/handleProratedUpgrade.js";
import Stripe from "stripe";
import { handleProratedDowngrade } from "./arrearProratedUsage/handleProratedDowngrade.js";

export const getUsageFromBalance = ({
  ent,
  price,
  balance,
}: {
  ent: Entitlement;
  price: Price;
  balance: number;
}) => {
  let config = price.config as UsagePriceConfig;
  let billingUnits = config.billing_units || 1;

  // Should get overage...
  let overage = -Math.min(0, balance);
  let roundedOverage = new Decimal(overage)
    .div(billingUnits)
    .ceil()
    .mul(billingUnits)
    .toNumber();

  let usage = new Decimal(ent.allowance!).sub(balance).toNumber();

  let roundedUsage = usage;
  if (overage > 0) {
    roundedUsage = new Decimal(usage)
      .div(billingUnits)
      .ceil()
      .mul(billingUnits)
      .toNumber();
  }

  return { usage, roundedUsage, overage, roundedOverage };
};

export const adjustAllowance = async ({
  db,
  env,
  org,
  affectedFeature,
  cusEnt,
  cusPrices,
  customer,
  originalBalance,
  newBalance,
  logger,
  errorIfIncomplete = false,
  // deduction,
  // product,
  // fromEntities = false,
}: {
  db: DrizzleCli;
  env: AppEnv;
  affectedFeature: Feature;
  org: Organization;
  cusEnt: FullCusEntWithFullCusProduct;
  cusPrices: FullCustomerPrice[];
  customer: Customer;
  originalBalance: number;
  newBalance: number;
  logger: any;
  errorIfIncomplete?: boolean;
}) => {
  let cusPrice = getRelatedCusPrice(cusEnt, cusPrices);
  let billingType = cusPrice ? getBillingType(cusPrice.price.config!) : null;
  let cusProduct = cusEnt.customer_product;

  if (
    !cusProduct ||
    !cusPrice ||
    billingType !== BillingType.InArrearProrated ||
    originalBalance == newBalance
  ) {
    return { newReplaceables: [], invoice: null, deletedReplaceables: null };
  }

  logger.info(`--------------------------------`);
  logger.info(`Updating arrear prorated usage: ${affectedFeature.name}`);
  logger.info(`Customer: ${customer.name}, Org: ${org.slug}`);

  let stripeCli = createStripeCli({ org, env });
  let sub = await getUsageBasedSub({
    db,
    stripeCli,
    subIds: cusProduct.subscription_ids!,
    feature: affectedFeature,
  });

  if (!sub) {
    logger.error("adjustAllowance: no usage-based sub found");
    return { newReplaceables: null, invoice: null, deletedReplaceables: null };
  }

  let subItem = findStripeItemForPrice({
    price: cusPrice.price,
    stripeItems: sub.items.data,
  });

  if (!subItem) {
    logger.error("adjustAllowance: no sub item found");
    return { newReplaceables: null, invoice: null, deletedReplaceables: null };
  }

  let isUpgrade = newBalance < originalBalance;

  if (isUpgrade) {
    return await handleProratedUpgrade({
      db,
      stripeCli,
      cusEnt,
      cusPrice,
      sub,
      subItem: subItem as Stripe.SubscriptionItem,
      newBalance,
      prevBalance: originalBalance,
      org,
      logger,
    });
  } else {
    return await handleProratedDowngrade({
      db,
      org,
      stripeCli,
      cusEnt,
      cusPrice,
      sub,
      subItem: subItem as Stripe.SubscriptionItem,
      newBalance,
      prevBalance: originalBalance,
      logger,
    });
  }

  // let isUpgrade = newBalance < originalBalance;

  // if (isUpgrade) {
  //   let onIncrease =
  //     cusPrice.price.proration_config?.on_increase ||
  //     OnIncrease.ProrateImmediately;

  //   if (onIncrease === OnIncrease.BillImmediately) {
  //     // Create invoice for new usage
  //   }

  //   let stripeProration = onIncreaseToStripeProration({
  //     onIncrease,
  //   });

  //   // Old quantity = old usage + replaced count

  //   await stripeCli.subscriptionItems.update(subItem.id, {
  //     quantity: roundedUsage,
  //     proration_behavior: "none",
  //     // proration_behavior: stripeProration,
  //     // payment_behavior: errorIfIncomplete ? "error_if_incomplete" : undefined,
  //   });

  //   logger.info(`Updated sub item ${subItem.id} to quantity: ${roundedUsage}`);
  // } else {
  //   let onDecrease =
  //     cusPrice.price.proration_config?.on_decrease || OnDecrease.Prorate;

  //   let stripeProration = onDecreaseToStripeProration({
  //     onDecrease,
  //   });

  //   await stripeCli.subscriptionItems.update(subItem.id, {
  //     quantity: roundedUsage,
  //     proration_behavior: stripeProration,
  //     payment_behavior: errorIfIncomplete ? "error_if_incomplete" : undefined,
  //   });
  // }

  // // throw new Error("test");

  // let prorationBehaviour = org.config.bill_upgrade_immediately
  //   ? "always_invoice"
  //   : "create_prorations";

  // // If prorate unused is false, then remove end of cycle

  // if (quantity < 0) {
  //   quantity = 0;
  // }

  // try {
  //   await stripeCli.subscriptionItems.update(subItem.id, {
  //     quantity: quantity,
  //     proration_behavior: prorationBehaviour as any,
  //     // payment_behavior: fromEntities ? "error_if_incomplete" : undefined,
  //   });
  //   logger.info(`   ✅ Adjusted sub item ${subItem.id} to ${quantity}`);
  // } catch (error: any) {
  //   // if (fromEntities) {
  //   //   throw new RecaseError({
  //   //     message: `Failed to update subscription subscription: ${error.message}`,
  //   //     code: ErrCode.StripeUpdateSubscriptionFailed,
  //   //     statusCode: error.statusCode,
  //   //   });
  //   // } else {
  //   //   logger.error(
  //   //     `❗️ adjustAllowance: Error updating subscription item (from event)`,
  //   //   );
  //   //   logger.error(error);
  //   // }
  // }

  // return;
};

// if (!org.config.prorate_unused) {
//   prorationBehaviour = "none";

//   const downgrade = quantity < (subItem.quantity || 0);
//   if (!downgrade && !isTrialing(cusProduct as FullCusProduct)) {
//     let entitlement = cusEnt.entitlement;
//     let newUsage = entitlement.allowance! - newBalance;
//     let oldUsage =
//       entitlement.allowance! - originalBalance + (replacedCount || 0);

//     let newAmount = getPriceForOverage(cusPrice.price, newUsage);
//     let oldAmount = getPriceForOverage(cusPrice.price, oldUsage);

//     const stripeAmount = new Decimal(newAmount)
//       .sub(oldAmount)
//       .mul(100)
//       .round()
//       .toNumber();

//     logger.info(`   - Stripe amount: ${stripeAmount}`);

//     if (stripeAmount > 0) {
//       const invoice = await stripeCli.invoices.create({
//         customer: customer.processor.id,
//         auto_advance: false,
//         subscription: sub.id,
//       });

//       if (!product) {
//         product = await ProductService.getByInternalId({
//           db,
//           internalId: cusProduct.internal_product_id,
//         });
//       }

//       await stripeCli.invoiceItems.create({
//         customer: customer.processor.id,
//         invoice: invoice.id,
//         quantity: 1,
//         description: `${product!.name} - ${
//           affectedFeature.name
//         } x ${Math.round(newUsage - oldUsage)}`,

//         price_data: {
//           product: config.stripe_product_id!,
//           unit_amount: stripeAmount,
//           currency: org.default_currency,
//         },
//       });

//       const { paid, error } = await payForInvoice({
//         stripeCli,
//         paymentMethod,
//         invoiceId: invoice.id,
//         logger,
//       });

//       if (!paid) {
//         try {
//           await stripeCli.invoices.voidInvoice(invoice.id);
//         } catch (error: any) {}

//         throw new RecaseError({
//           message: "Failed to pay for invoice",
//           code: ErrCode.PayInvoiceFailed,
//           data: {
//             invoiceId: invoice.id,
//             error,
//           },
//         });
//       }

//       const latestInvoice = await stripeCli.invoices.retrieve(invoice.id, {
//         ...getInvoiceExpansion(),
//       });

//       let invoiceItems: InvoiceItem[] = [];
//       try {
//         invoiceItems = [
//           {
//             price_id: cusPrice.price.id!,
//             stripe_id: latestInvoice.id,
//             internal_feature_id: affectedFeature.internal_id || null,
//             description: `${product!.name} - ${
//               affectedFeature.name
//             } x ${Math.round(newUsage - oldUsage)}`,
//             period_start: Date.now(),
//             period_end: sub.current_period_end * 1000,
//           },
//         ];
//       } catch (error) {}

//       await InvoiceService.createInvoiceFromStripe({
//         db,
//         stripeInvoice: latestInvoice,
//         internalCustomerId: customer.internal_id,
//         internalEntityId: cusProduct.internal_entity_id || undefined,
//         org,
//         productIds: [product!.id],
//         internalProductIds: [product!.internal_id],
//         items: invoiceItems,
//       });
//     }
//   }
// }

// let paidUsage = -newBalance;
// if (paidUsage > 0) {
//   let roundedPaidUsage = new Decimal(paidUsage)
//     .div(config.billing_units || 1)
//     .ceil()
//     .mul(config.billing_units || 1)
//     .toNumber();
//   paidUsage = roundedPaidUsage;
// }

// let quantity = new Decimal(paidUsage)
//   .add(cusEnt.entitlement.allowance!)
//   .toNumber();
