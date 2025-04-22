import {
  ErrCode,
  FullCusProduct,
  FullCustomerEntitlement,
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
import { SupabaseClient } from "@supabase/supabase-js";

import { getRelatedCusPrice } from "@/internal/customers/entitlements/cusEntUtils.js";
import {
  getBillingType,
  getPriceForOverage,
} from "@/internal/prices/priceUtils.js";

import { getUsageBasedSub } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";

import { Decimal } from "decimal.js";

import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";
import { LoggerAction } from "@autumn/shared";
import {
  getInvoiceExpansion,
  payForInvoice,
} from "@/external/stripe/stripeInvoiceUtils.js";
import { isTrialing } from "@/internal/customers/products/cusProductUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import RecaseError from "@/utils/errorUtils.js";

type CusEntWithCusProduct = FullCustomerEntitlement & {
  customer_product: CusProduct;
};

export const adjustAllowance = async ({
  sb,
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
}: {
  sb: SupabaseClient;
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
    }`
  );

  if (!cusProduct) {
    logger.error(
      "❗️ Error: can't adjust allowance, no customer product found"
    );
    return;
  }

  let stripeCli = createStripeCli({ org, env });

  let sub = await getUsageBasedSub({
    sb: sb,
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
    (item) => item.price.id === config.stripe_price_id
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
    `   - New quantity = ${paidUsage} (paid) + ${cusEnt.entitlement.allowance} (allowance) = ${quantity} `
  );

  let prorationBehaviour = "create_prorations";

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
            sb,
            internalId: cusProduct.internal_product_id,
            orgId: org.id,
            env,
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
          await stripeCli.invoices.voidInvoice(invoice.id);
          throw new RecaseError({
            message: "Failed to pay for invoice",
            code: ErrCode.PayInvoiceFailed,
          });
        }

        const latestInvoice = await stripeCli.invoices.retrieve(invoice.id, {
          ...getInvoiceExpansion(),
        });

        await InvoiceService.createInvoiceFromStripe({
          sb,
          stripeInvoice: latestInvoice,
          internalCustomerId: customer.internal_id,
          org,
          productIds: [product!.id],
          internalProductIds: [product!.internal_id],
        });

        if (!paid) {
          logger.warn("❗️ Failed to pay for invoice!");
        }
      }
    }
  }

  if (quantity < 0) {
    quantity = 0;
    logger.warn("❗️ Warning: quantity is negative, setting to 0");
    logger.warn(
      `❗️ Allowance: ${cusEnt.entitlement.allowance}, New Balance: ${newBalance}`
    );
  }

  try {
    await stripeCli.subscriptionItems.update(subItem.id, {
      quantity: quantity,
      proration_behavior: prorationBehaviour as any,
    });
    logger.info(`   ✅ Adjusted sub item ${subItem.id} to ${quantity}`);
  } catch (error: any) {
    logger.error(`❗️ Error updating subscription item`);
    logger.error(error);
    return;
  }

  return;
};
