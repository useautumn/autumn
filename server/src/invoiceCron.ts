import Stripe from "stripe";
import { getCusPaymentMethod } from "./external/stripe/stripeCusUtils.js";
import { createStripeCli } from "./external/stripe/utils.js";
import { createSupabaseClient } from "./external/supabaseUtils.js";
import { CusService } from "./internal/customers/CusService.js";
import { getFeatureBalance } from "./internal/customers/entitlements/cusEntUtils.js";
import { OrgService } from "./internal/orgs/OrgService.js";
import { ProductService } from "./internal/products/ProductService.js";
import { createPgClient } from "./middleware/envMiddleware.js";
import {
  AppEnv,
  BillingType,
  CusProduct,
  CusProductSchema,
  Customer,
  Entitlement,
  EntitlementWithFeatureSchema,
  Organization,
  Price,
  PriceOptions,
  UsagePriceConfig,
} from "@autumn/shared";

import dotenv from "dotenv";
import { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { InvoiceService } from "./internal/customers/invoices/InvoiceService.js";
import { Invoice } from "@autumn/shared";
import { generateId } from "./utils/genUtils.js";

dotenv.config();

const createStripeInvoice = async ({
  fullOrg,
  customer,
  price,
  entitlement,
  env,
}: {
  fullOrg: Organization;
  customer: Customer;
  price: Price;
  entitlement: Entitlement;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({
    org: fullOrg,
    env,
  });

  let config = price.config as UsagePriceConfig;

  if (!config.usage_tiers || config.usage_tiers.length === 0) {
    throw new Error("No usage tiers found");
  }

  const paymentMethod = await getCusPaymentMethod({
    org: fullOrg,
    env: env,
    stripeId: customer.processor.id,
  });

  if (!paymentMethod) {
    throw new Error("No payment method found");
  }

  let invoice: Stripe.Invoice;
  try {
    invoice = await stripeCli.invoices.create({
      customer: customer.processor.id,
      auto_advance: true,
    });
  } catch (error: any) {
    throw new Error("Failed to create invoice: " + error?.message || error);
  }

  try {
    await stripeCli.invoiceItems.create({
      customer: customer.processor.id,
      amount: config.usage_tiers[0].amount * 100, // TODO: Handle multiple tiers
      invoice: invoice.id,
      description: `Usage based pricing - ${entitlement.allowance} ${entitlement.feature_id} units`,
    });
  } catch (error: any) {
    throw new Error(
      "Failed to create invoice item: " + error?.message || error
    );
  }

  let finalizedInvoice: Stripe.Invoice;
  try {
    finalizedInvoice = await stripeCli.invoices.finalizeInvoice(invoice.id);
  } catch (error: any) {
    throw new Error("Failed to finalize invoice: " + error?.message || error);
  }

  try {
    await stripeCli.invoices.pay(finalizedInvoice.id, {
      payment_method: paymentMethod as string,
    });
  } catch (error: any) {
    throw new Error("Failed to pay invoice: " + error?.message || error);
  }

  return finalizedInvoice;
};

const handleBillWhenBelowThreshold = async ({
  pg,
  sb,
  cusProduct,
  price,
  entitlement,
}: {
  pg: Client;
  sb: SupabaseClient;
  cusProduct: CusProduct;
  price: Price;
  entitlement: Entitlement;
}) => {
  // 1. Get customer
  const customer = await CusService.getByInternalId({
    sb,
    internalId: cusProduct.internal_customer_id,
  });

  const env = customer.env;
  const orgId = customer.org_id;

  const fullOrg = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  // 1. Full product
  const fullProduct = await ProductService.getFullProductStrict({
    sb,
    productId: cusProduct.product_id,
    orgId: orgId,
    env,
  });

  // Get below threshold prices from product
  const belowThresholdPrices = fullProduct.prices.filter((price: Price) => {
    return price.billing_type == BillingType.UsageBelowThreshold;
  });

  console.log("--------------------------------");
  console.log("Customer:", customer.name);
  console.log("Product:", fullProduct.name);

  // if entitlement is 1k / month -> resets every month...
  for (const price of belowThresholdPrices) {
    const entitlement = EntitlementWithFeatureSchema.parse(
      fullProduct.entitlements.find(
        (entitlement: Entitlement) =>
          entitlement.id == price.config.entitlement_id
      )
    );

    // const priceOptions = cusProduct.price_options.find(
    //   (priceOption: PriceOptions) => priceOption.id == price.id
    // );

    // const threshold = priceOptions?.options?.threshold;
    // TODO: Get threshold from price
    const threshold = null;

    if (!threshold) {
      continue;
    }

    const featureBalance = await getFeatureBalance({
      pg,
      customerId: customer.id,
      featureId: entitlement.feature.id,
      orgId: orgId,
    });

    console.log(`Feature: ${entitlement.feature.name}`);
    console.log(`Balance: ${featureBalance} | Threshold: ${threshold}`);

    if (featureBalance === null) {
      return;
    }

    if (featureBalance < threshold) {
      console.log("Feature balance < threshold, creating invoice...");

      // Create invoice
      let invoice: Stripe.Invoice;
      try {
        invoice = await createStripeInvoice({
          fullOrg,
          customer,
          price,
          entitlement,
          env,
        });

        console.log("Invoice successful:", invoice.id);
      } catch (error: any) {
        console.log("Failed to create invoice: " + error?.message || error);
        return;
      }

      let invoiceData: Invoice = {
        id: generateId("inv"),
        created_at: invoice.created,
        internal_customer_id: customer.internal_id,
        product_ids: [cusProduct.id],
        processor: {
          id: customer.processor.id,
          type: customer.processor.type,
          hosted_invoice_url: invoice.hosted_invoice_url || null,
        },
      };

      console.log("Topping up customer balance");
      console.log("Update amount:", entitlement.allowance);

      const updateAmount = entitlement.allowance;

      const { rows } = await pg.query(
        `UPDATE customer_entitlements
        SET balance = balance + ${updateAmount} 
        WHERE entitlement_id = '${entitlement.id}' 
        AND internal_customer_id = '${customer.internal_id}' 
        AND org_id = '${orgId}'`
      );

      await InvoiceService.createInvoice({
        sb,
        invoice: invoiceData,
      });

      console.log("Customer entitlement balance updated successfully");
    }
  }
};

const invoiceCron = async () => {
  // Fetch products where billing type is below_threshold

  const sb = createSupabaseClient();
  const pg = createPgClient();
  await pg.connect();

  const { rows } = await pg.query(`
    with event_driven_prices as (select product_id from prices where config ->> 'bill_when' = 'below_threshold')
    select * from customer_products cp 
    where cp.product_id IN (
      select product_id from event_driven_prices
    )
  `);

  for (const row of rows) {
    row.created_at = parseInt(row.created_at);
    await handleBillWhenBelowThreshold({
      pg,
      sb,
      cusProduct: CusProductSchema.parse(row),
      price: row.price as Price,
      entitlement: row.entitlement as Entitlement,
    });
  }

  await pg.end();
};

const init = async () => {
  try {
    await invoiceCron();
  } catch (error: any) {
    console.log(
      "FAILED TO RUN INVOICE CRON, ERROR:\n" + error?.message || error
    );
    process.exit(0);
  }
};

setInterval(init, 60 * 1000);
