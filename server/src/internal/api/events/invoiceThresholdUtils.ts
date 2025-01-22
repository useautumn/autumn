import Stripe from "stripe";
import { getCusPaymentMethod } from "../../../external/stripe/stripeCusUtils.js";
import { createStripeCli } from "../../../external/stripe/utils.js";
import { createSupabaseClient } from "../../../external/supabaseUtils.js";
import { CusService } from "../../customers/CusService.js";
import { getFeatureBalance } from "../../customers/entitlements/cusEntUtils.js";
import { OrgService } from "../../orgs/OrgService.js";
import { ProductService } from "../../products/ProductService.js";
import { createPgClient } from "../../../middleware/envMiddleware.js";
import {
  AppEnv,
  BillingType,
  CusProduct,
  Customer,
  Entitlement,
  EntitlementWithFeatureSchema,
  Organization,
  Price,
  UsagePriceConfig,
  FullCustomerPrice,
  FullCusProduct,
  CusProductStatus,
  EntitlementWithFeature,
  CustomerEntitlement,
  FullCustomerEntitlement,
} from "@autumn/shared";

import dotenv from "dotenv";
import { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { InvoiceService } from "../../customers/invoices/InvoiceService.js";
import { Invoice } from "@autumn/shared";
import { generateId } from "../../../utils/genUtils.js";
import { CusProductService } from "../../customers/products/CusProductService.js";
import { getEntOptions, getPriceEntitlement } from "../../prices/priceUtils.js";
import { CustomerEntitlementService } from "../../customers/entitlements/CusEntitlementService.js";
import chalk from "chalk";

dotenv.config();

const createBelowThresholdInvoice = async ({
  stripeCli,
  customer,
  fullCusPrice,
  productName,
}: {
  stripeCli: Stripe;
  customer: Customer;
  fullCusPrice: FullCustomerPrice;
  productName: string;
}) => {
  const price = fullCusPrice.price;
  const config = price.config as UsagePriceConfig;

  const invoice = await stripeCli.invoices.create({
    customer: customer.processor.id,
    auto_advance: true,
  });

  // 2. Create invoice item
  await stripeCli.invoiceItems.create({
    customer: customer.processor.id,
    amount: config.usage_tiers[0].amount * 100,
    invoice: invoice.id,
    description: `Invoice for ${productName}`,
  });

  // 3. Finalize invoice
  const finalizedInvoice = await stripeCli.invoices.finalizeInvoice(invoice.id);

  return finalizedInvoice;
};

const payForInvoice = async ({
  fullOrg,
  env,
  stripeCli,
  customer,
  invoice,
}: {
  fullOrg: Organization;
  env: AppEnv;
  stripeCli: Stripe;
  customer: Customer;
  invoice: Stripe.Invoice;
}) => {
  const paymentMethod = await getCusPaymentMethod({
    org: fullOrg,
    env: env as AppEnv,
    stripeId: customer.processor.id,
  });

  if (!paymentMethod) {
    return false;
  }

  try {
    await stripeCli.invoices.pay(invoice.id, {
      payment_method: paymentMethod as string,
    });
  } catch (error: any) {
    console.log("Failed to pay invoice: " + error?.message || error);
    return false;
  }

  return true;
};

const handleInvoicePaymentFailure = async ({
  sb,
  fullCusProduct,
  fullCusPrice,
  finalizedInvoice,
}: {
  sb: SupabaseClient;
  fullCusProduct: FullCusProduct;
  fullCusPrice: FullCustomerPrice;
  finalizedInvoice: Stripe.Invoice;
}) => {
  // 1. Update customer product
  console.log(
    "Payment failed, updating customer product status to past due..."
  );
  await CusProductService.update({
    sb,
    cusProductId: fullCusProduct.id,
    updates: {
      status: CusProductStatus.PastDue,
      processor: {
        ...fullCusProduct.processor!,
        last_invoice_id: finalizedInvoice.id,
      },
    },
  });

  console.log("Customer product updated successfully");
};

const invoiceCustomer = async ({
  sb,
  fullCusProduct,
  fullCusPrice,
}: {
  sb: SupabaseClient;
  fullCusProduct: FullCusProduct;
  fullCusPrice: FullCustomerPrice;
}) => {
  const price = fullCusPrice.price;
  const config = price.config as UsagePriceConfig;
  const customer = fullCusProduct.customer;
  const env = customer.env;
  const orgId = customer.org_id;

  const cusEnt = fullCusProduct.customer_entitlements.find(
    (ce: any) => ce.entitlement.id == config.entitlement_id
  );

  if (!cusEnt) {
    console.log("Corresponding customer entitlement not found");
    return;
  }

  const fullOrg = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  const stripeCli = createStripeCli({
    org: fullOrg,
    env: env as AppEnv,
  });

  // 1. Create invoice
  console.log("1. Creating invoice...");
  const finalizedInvoice = await createBelowThresholdInvoice({
    stripeCli,
    customer,
    fullCusPrice,
    productName: fullCusProduct.product.name,
  });

  // 2. Pay for invoice
  console.log("2. Paying for invoice...");
  const paid = await payForInvoice({
    fullOrg,
    env: customer.env as AppEnv,
    stripeCli,
    customer,
    invoice: finalizedInvoice,
  });

  if (!paid) {
    console.log("Failed to pay for invoice");
    await handleInvoicePaymentFailure({
      sb,
      fullCusProduct,
      fullCusPrice,
      finalizedInvoice,
    });
    return;
  }

  console.log("3. Inserting invoice into db...");
  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice: finalizedInvoice,
    internalCustomerId: customer.internal_id,
    productIds: [fullCusProduct.product.id],
  });

  // 4. Update customer product
  console.log("4. Updating customer product...");
  await CusProductService.update({
    sb,
    cusProductId: fullCusProduct.id,
    updates: {
      processor: {
        ...fullCusProduct.processor!,
        last_invoice_id: finalizedInvoice.id,
      },
    },
  });

  // 5. Update feature balance
  console.log("5. Updating feature balance...");
  const newBalance = cusEnt.balance! + cusEnt.entitlement.allowance!;

  console.log(
    "Current balance:",
    cusEnt.balance,
    "| Update amount:",
    cusEnt.entitlement.allowance
  );

  await CustomerEntitlementService.update({
    sb,
    id: cusEnt.id,
    updates: {
      balance: newBalance,
    },
  });
};

// CHECK BALANCE BELOW THRESHOLD HELPERS
const getCustomerFeatureBalance = async ({
  sb,
  internalCustomerId,
  internalFeatureId,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  internalFeatureId: string;
}) => {
  const cusEnts = await CustomerEntitlementService.getActiveByFeatureId({
    sb,
    internalCustomerId,
    internalFeatureId,
  });

  const balance = cusEnts.reduce((acc, ent) => {
    return acc + ent.balance;
  }, 0);

  return balance;
};

const checkBalanceBelowThreshold = async ({
  sb,
  fullCusProduct,
  belowThresholdPrice,
}: {
  sb: SupabaseClient;
  fullCusProduct: FullCusProduct;
  belowThresholdPrice: FullCustomerPrice;
}) => {
  // 1. Get options
  const entitlements = fullCusProduct.customer_entitlements.map(
    (ce: any) => ce.entitlement
  );
  const priceEnt = getPriceEntitlement(belowThresholdPrice.price, entitlements);
  const options = getEntOptions(fullCusProduct.options, priceEnt);

  // 2. Get feature balance for customer
  const featureBalance = await getCustomerFeatureBalance({
    sb,
    internalCustomerId: fullCusProduct.internal_customer_id,
    internalFeatureId: priceEnt.feature.internal_id!,
  });

  return options?.threshold && featureBalance < options?.threshold;
};

// FUNCTION 2: QUEUE CHECK BELOW THRESHOLD PRICE
export const handleBelowThresholdInvoicing = async ({
  sb,
  internalCustomerId,
  belowThresholdPrice,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  belowThresholdPrice: FullCustomerPrice;
}) => {
  // 2. Get full customer product
  const fullCusProduct = await CusProductService.getFullCusProduct({
    sb,
    cusProductId: belowThresholdPrice.customer_product_id,
  });

  // 3. Check if cus product is past due?
  if (fullCusProduct.status === CusProductStatus.PastDue) {
    console.log("Previous invoice not paid, skipping...");
    return;
  }

  // 4. Check if feature balance is below threshold
  const belowThreshold = await checkBalanceBelowThreshold({
    sb,
    fullCusProduct,
    belowThresholdPrice,
  });

  console.log("Below threshold:", belowThreshold);
  if (!belowThreshold) {
    return;
  }

  console.log("Feature balance < threshold, creating invoice...");

  // 1. Invoice customer
  await invoiceCustomer({
    sb,
    fullCusProduct,
    fullCusPrice: belowThresholdPrice,
  });
};

// FUNCTION 1: CHECK IF THERE'S A BELOW THRESHOLD PRICE
export const getBelowThresholdPrice = async ({
  sb,
  internalCustomerId,
  cusEnts,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  cusEnts: CustomerEntitlement[];
}) => {
  // 1. Get below threshold price
  const { data, error } = await sb
    .from("customer_prices")
    .select("*, price:prices!inner(*)")
    .eq("internal_customer_id", internalCustomerId)
    .eq("price.billing_type", "usage_below_threshold")
    .in(
      "price.config->>entitlement_id",
      cusEnts.map((ent) => ent.entitlement_id)
    );

  // TODO: extend this to handle multiple below threshold prices
  let belowThresholdPrice = data && data.length > 0 ? data[0] : null;
  return belowThresholdPrice;
};
