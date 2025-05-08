import Stripe from "stripe";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
  AppEnv,
  Customer,
  Organization,
  UsagePriceConfig,
  FullCustomerPrice,
  FullCusProduct,
  CusProductStatus,
  CustomerEntitlement,
  InvoiceStatus,
} from "@autumn/shared";

import dotenv from "dotenv";
import { SupabaseClient } from "@supabase/supabase-js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  getEntOptions,
  getPriceEntitlement,
} from "@/internal/prices/priceUtils.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import {
  getInvoiceExpansion,
  getStripeExpandedInvoice,
  payForInvoice,
} from "@/external/stripe/stripeInvoiceUtils.js";
import { getRelatedCusEnt } from "@/internal/customers/prices/cusPriceUtils.js";

dotenv.config();

// FUNCTION 3: INVOICE CUSTOMER FOR BELOW THRESHOLD PRICE
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
    ...getInvoiceExpansion(),
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

const handleInvoicePaymentFailure = async ({
  sb,
  stripeCli,
  fullCusProduct,
  fullCusPrice,
  finalizedInvoice,
  fullOrg,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  fullCusProduct: FullCusProduct;
  fullCusPrice: FullCustomerPrice;
  finalizedInvoice: Stripe.Invoice;
  fullOrg: Organization;
}) => {
  // 1. Update customer product
  console.log("   Handling invoice payment failure...");

  // Void invoice
  await stripeCli.invoices.voidInvoice(finalizedInvoice.id);
  console.log("   a. Stripe invoice voided");

  const expandedInvoice = await getStripeExpandedInvoice({
    stripeCli,
    stripeInvoiceId: finalizedInvoice.id,
  });

  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice: expandedInvoice,
    internalCustomerId: fullCusProduct.internal_customer_id,
    productIds: [fullCusProduct.product.id],
    internalProductIds: [fullCusProduct.internal_product_id],
    internalEntityId: fullCusProduct.internal_entity_id || undefined,
    status: InvoiceStatus.Void,
    org: fullOrg,
  });
  console.log("   b. Invoice inserted into db");

  await CusProductService.update({
    sb,
    cusProductId: fullCusProduct.id,
    updates: {
      status: CusProductStatus.Expired,
      ended_at: Date.now(),
      processor: {
        ...fullCusProduct.processor!,
        last_invoice_id: finalizedInvoice.id,
      },
    },
  });

  console.log("   c. Expired customer product");
};

const invoiceCustomer = async ({
  sb,
  fullCusProduct,
  fullCusPrice,
  logger,
}: {
  sb: SupabaseClient;
  fullCusProduct: FullCusProduct;
  fullCusPrice: FullCustomerPrice;
  logger: any;
}) => {
  const price = fullCusPrice.price;
  const config = price.config as UsagePriceConfig;
  const customer = fullCusProduct.customer;
  const env = customer.env;
  const orgId = customer.org_id;

  // const cusEnt = fullCusProduct.customer_entitlements.find(
  //   (ce: any) =>
  //     ce.entitlement.internal_feature_id == config.internal_feature_id
  // );
  let cusEnt = getRelatedCusEnt({
    cusPrice: fullCusPrice,
    cusEnts: fullCusProduct.customer_entitlements,
  });

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
  console.log("   a. Creating invoice...");
  const finalizedInvoice = await createBelowThresholdInvoice({
    stripeCli,
    customer,
    fullCusPrice,
    productName: fullCusProduct.product.name,
  });

  // 2. Pay for invoice
  console.log("   b. Paying for invoice...");
  const { paid, error } = await payForInvoice({
    fullOrg,
    env: customer.env as AppEnv,
    customer,
    invoice: finalizedInvoice,
    logger,
  });

  if (!paid) {
    console.log("   ❌ Failed to pay for invoice");
    await handleInvoicePaymentFailure({
      sb,
      stripeCli,
      fullCusProduct,
      fullCusPrice,
      finalizedInvoice,
      fullOrg,
    });
    return;
  }

  // 3. Insert invoice into db
  console.log("   c. Inserting invoice into db...");
  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice: finalizedInvoice,
    internalCustomerId: customer.internal_id,
    productIds: [fullCusProduct.product.id],
    internalProductIds: [fullCusProduct.internal_product_id],
    internalEntityId: fullCusProduct.internal_entity_id || undefined,
    status: InvoiceStatus.Paid,
    org: fullOrg,
  });

  // 4. Update customer product
  console.log("   d. Updating customer product...");
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
  console.log("   e. Updating feature balance...");
  const newBalance = cusEnt.balance! + cusEnt.entitlement.allowance!;

  console.log(
    "   - Current balance:",
    cusEnt.balance,
    "| Update amount:",
    cusEnt.entitlement.allowance,
    "| New balance:",
    newBalance
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

  return {
    threshold: null,
    balance: featureBalance,
    below: false,
  };
};

// FUNCTION 2: QUEUE CHECK BELOW THRESHOLD PRICE
export const handleBelowThresholdInvoicing = async ({
  sb,
  belowThresholdPrice,
  logger,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  belowThresholdPrice: FullCustomerPrice;
  logger: any;
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
  const { threshold, balance, below } = await checkBalanceBelowThreshold({
    sb,
    fullCusProduct,
    belowThresholdPrice,
  });

  console.log(
    `   - Current balance: ${balance}, threshold: ${threshold}, below: ${below}`
  );

  if (!below) {
    return;
  }

  // 1. Invoice customer
  await invoiceCustomer({
    sb,
    fullCusProduct,
    fullCusPrice: belowThresholdPrice,
    logger,
  });
};

// NON QUEUE BASED
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
