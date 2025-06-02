import {
  ErrCode,
  FullCusProduct,
  FullCustomerEntitlement,
  InvoiceItem,
  Product,
} from "@autumn/shared";
import {
  AppEnv,
  BillingType,
  CusProduct,
  Customer,
  Feature,
  FullCustomerPrice,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";

import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import {
  getBillingType,
  getPriceForOverage,
} from "@/internal/products/prices/priceUtils.js";

import { getUsageBasedSub } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";

import { Decimal } from "decimal.js";

import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";
import { LoggerAction } from "@autumn/shared";
import {
  getInvoiceExpansion,
  payForInvoice,
} from "@/external/stripe/stripeInvoiceUtils.js";
import { isTrialing } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import RecaseError from "@/utils/errorUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

type CusEntWithCusProduct = FullCustomerEntitlement & {
  customer_product: CusProduct;
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
  deduction,
  product,
  replacedCount,
  fromEntities = false,
}: {
  db: DrizzleCli;
  env: AppEnv;
  affectedFeature: Feature;
  org: Organization;
  cusEnt: CusEntWithCusProduct;
  cusPrices: FullCustomerPrice[];
  customer: Customer;
  originalBalance: number;
  newBalance: number;
  deduction: number;
  product?: Product;
  replacedCount?: number;
  fromEntities?: boolean;
}) => {
  // Get customer entitlement

  if (originalBalance == newBalance) {
    return;
  }

  // 1. Check if price is prorated in arrear, if not skip...
  let logger = createLogtailWithContext({
    org_id: org.id,
    org_slug: org.slug,
    customer,
    action: LoggerAction.AdjustAllowance,
  });

  let cusPrice = getRelatedCusPrice(cusEnt, cusPrices);
  let billingType = cusPrice ? getBillingType(cusPrice.price.config!) : null;
  let cusProduct = cusEnt.customer_product;

  if (!cusPrice || billingType !== BillingType.InArrearProrated) {
    return;
  }

  logger.info(`Updating prorated in arrear usage for ${affectedFeature.name}`);
  logger.info(`   - Customer: ${customer.name}, Org: ${org.slug}`);
  logger.info(
    `   - Balance: ${originalBalance} -> ${newBalance}${
      replacedCount ? ` (replaced ${replacedCount})` : ""
    }`,
  );

  if (!cusProduct) {
    logger.error("❗️ Error: can't adjust allowance, no customer product found");
    return;
  }

  let stripeCli = createStripeCli({ org, env });

  let sub = await getUsageBasedSub({
    db,
    stripeCli,
    subIds: cusProduct.subscription_ids!,
    feature: affectedFeature,
  });

  if (!sub) {
    logger.error("❗️ Error: can't adjust allowance, no usage-based sub found");
    return;
  }

  // Update sub item
  let config = cusPrice.price.config as UsagePriceConfig;

  let subItem = sub.items.data.find(
    (item) => item.price.id === config.stripe_price_id,
  );

  if (!subItem) {
    logger.error("❗️ Error: can't adjust allowance, no sub item found");
    return;
  }

  let paidUsage = -newBalance;
  if (paidUsage > 0) {
    let roundedPaidUsage = new Decimal(paidUsage)
      .div(config.billing_units || 1)
      .ceil()
      .mul(config.billing_units || 1)
      .toNumber();

    paidUsage = roundedPaidUsage;
  }

  let quantity = new Decimal(paidUsage)
    .add(cusEnt.entitlement.allowance!)
    .toNumber();

  logger.info(
    `   - New quantity = ${paidUsage} (paid) + ${cusEnt.entitlement.allowance} (allowance) = ${quantity} `,
  );

  let prorationBehaviour = org.config.bill_upgrade_immediately
    ? "always_invoice"
    : "create_prorations";

  // If prorate unused is false, then remove end of cycle
  if (!org.config.prorate_unused) {
    prorationBehaviour = "none";

    const downgrade = quantity < (subItem.quantity || 0);
    if (!downgrade && !isTrialing(cusProduct as FullCusProduct)) {
      let entitlement = cusEnt.entitlement;
      let newUsage = entitlement.allowance! - newBalance;
      let oldUsage =
        entitlement.allowance! - originalBalance + (replacedCount || 0);

      let newAmount = getPriceForOverage(cusPrice.price, newUsage);
      let oldAmount = getPriceForOverage(cusPrice.price, oldUsage);

      const stripeAmount = new Decimal(newAmount)
        .sub(oldAmount)
        .mul(100)
        .round()
        .toNumber();

      logger.info(`   - Stripe amount: ${stripeAmount}`);

      if (stripeAmount > 0) {
        const invoice = await stripeCli.invoices.create({
          customer: customer.processor.id,
          auto_advance: false,
          subscription: sub.id,
        });

        if (!product) {
          product = await ProductService.getByInternalId({
            db,
            internalId: cusProduct.internal_product_id,
          });
        }

        await stripeCli.invoiceItems.create({
          customer: customer.processor.id,
          invoice: invoice.id,
          quantity: 1,
          description: `${product!.name} - ${
            affectedFeature.name
          } x ${Math.round(newUsage - oldUsage)}`,

          price_data: {
            product: config.stripe_product_id!,
            unit_amount: stripeAmount,
            currency: org.default_currency,
          },
        });

        const { paid, error } = await payForInvoice({
          fullOrg: org,
          env,
          customer,
          invoice,
          logger,
        });

        if (!paid) {
          try {
            await stripeCli.invoices.voidInvoice(invoice.id);
          } catch (error: any) {}

          throw new RecaseError({
            message: "Failed to pay for invoice",
            code: ErrCode.PayInvoiceFailed,
            data: {
              invoiceId: invoice.id,
              error,
            },
          });
        }

        const latestInvoice = await stripeCli.invoices.retrieve(invoice.id, {
          ...getInvoiceExpansion(),
        });

        let invoiceItems: InvoiceItem[] = [];
        try {
          invoiceItems = [
            {
              price_id: cusPrice.price.id!,
              stripe_id: latestInvoice.id,
              internal_feature_id: affectedFeature.internal_id || null,
              description: `${product!.name} - ${
                affectedFeature.name
              } x ${Math.round(newUsage - oldUsage)}`,
              period_start: Date.now(),
              period_end: sub.current_period_end * 1000,
            },
          ];
        } catch (error) {}

        await InvoiceService.createInvoiceFromStripe({
          db,
          stripeInvoice: latestInvoice,
          internalCustomerId: customer.internal_id,
          internalEntityId: cusProduct.internal_entity_id || undefined,
          org,
          productIds: [product!.id],
          internalProductIds: [product!.internal_id],
          items: invoiceItems,
        });
      }
    }
  }

  if (quantity < 0) {
    quantity = 0;
    logger.warn("❗️ Warning: quantity is negative, setting to 0");
    logger.warn(
      `❗️ Allowance: ${cusEnt.entitlement.allowance}, New Balance: ${newBalance}`,
    );
  }

  try {
    await stripeCli.subscriptionItems.update(subItem.id, {
      quantity: quantity,
      proration_behavior: prorationBehaviour as any,
      payment_behavior: fromEntities ? "error_if_incomplete" : undefined,
    });
    logger.info(`   ✅ Adjusted sub item ${subItem.id} to ${quantity}`);
  } catch (error: any) {
    if (fromEntities) {
      throw new RecaseError({
        message: `Failed to update subscription subscription: ${error.message}`,
        code: ErrCode.StripeUpdateSubscriptionFailed,
        statusCode: error.statusCode,
      });
    } else {
      logger.error(
        `❗️ adjustAllowance: Error updating subscription item (from event)`,
      );
      logger.error(error);
    }
  }

  return;
};
