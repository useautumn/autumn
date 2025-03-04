import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import {
  getStripeSubs,
  updateStripeSubscription,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import {
  getBillingType,
  getPriceForOverage,
} from "@/internal/prices/priceUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import {
  attachToInsertParams,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  CusProductWithProduct,
  FullCusProduct,
  UsagePriceConfig,
  BillingType,
  ErrCode,
  FullProduct,
  CusProductStatus,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { handleAddProduct } from "../add-product/handleAddProduct.js";
import { InvoiceService } from "../invoices/InvoiceService.js";
import { AttachParams } from "../products/AttachParams.js";
import { CustomerEntitlementService } from "../entitlements/CusEntitlementService.js";
import { CusProductService } from "../products/CusProductService.js";

// UPGRADE FUNCTIONS
const handleStripeSubUpdate = async ({
  sb,
  stripeCli,
  curCusProduct,
  attachParams,
  disableFreeTrial,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  curCusProduct: FullCusProduct;
  attachParams: AttachParams;
  disableFreeTrial?: boolean;
}) => {
  // HANLDE UPGRADE
  // Get stripe subscription from product
  const itemSets = await getStripeSubItems({
    attachParams,
  });

  // 1. Update the first one, cancel subsequent ones, create new ones
  const existingSubIds = curCusProduct.subscription_ids!;

  const stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: existingSubIds,
  });

  stripeSubs.sort((a, b) => b.current_period_end - a.current_period_end);

  const firstExistingSubId = stripeSubs[0].id;
  const firstItemSet = itemSets[0];
  const subscription = stripeSubs[0];

  // let curPrices = curCusProduct.customer_prices.map((cp) => cp.price);
  for (const item of subscription.items.data) {
    // Only want to cancel the item that belongs to current cus product...
    let priceId = item.price.id;

    // Check if prices
    firstItemSet.items.push({
      id: item.id,
      deleted: true,
    });
  }

  let trialEnd = undefined;
  if (!disableFreeTrial) {
    trialEnd = freeTrialToStripeTimestamp(attachParams.freeTrial);
  }

  // Switch subscription
  const subUpdate: Stripe.Subscription = await updateStripeSubscription({
    stripeCli,
    subscriptionId: firstExistingSubId,
    items: firstItemSet.items,
    trialEnd,
    org: attachParams.org,
    customer: attachParams.customer,
    prices: firstItemSet.prices,
  });

  try {
    // Insert latest invoice ID
    const subUpdateInvoice = await stripeCli.invoices.retrieve(
      subUpdate.latest_invoice as string
    );
    await InvoiceService.createInvoiceFromStripe({
      sb,
      stripeInvoice: subUpdateInvoice,
      internalCustomerId: attachParams.customer.internal_id,
      org: attachParams.org,
      productIds: [attachParams.product.id],
      internalProductIds: [attachParams.product.internal_id],
    });
    console.log("   - Inserted latest invoice ID for subscription update");
  } catch (error) {
    console.log(
      "Error inserting latest invoice ID for subscription update",
      error
    );
  }

  // 2. Create new subscriptions
  let newSubIds = [];
  newSubIds.push(firstExistingSubId);
  const newItemSets = itemSets.slice(1);

  let invoiceIds = [];
  for (const itemSet of newItemSets) {
    const newSub = await stripeCli.subscriptions.create({
      customer: attachParams.customer.processor.id,
      items: itemSet.items,
      metadata: itemSet.subMeta,
    });

    newSubIds.push(newSub.id);
    invoiceIds.push(newSub.latest_invoice as string);
  }

  // 3. Cancel old subscriptions
  let remainingExistingSubIds = stripeSubs.slice(1).map((sub) => sub.id);

  return {
    subUpdate,
    newSubIds,
    invoiceIds,
    remainingExistingSubIds,
  };
};

const billForRemainingUsages = async ({
  sb,
  attachParams,
  curCusProduct,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
}) => {
  const { customer_prices, customer_entitlements } = curCusProduct;
  const { customer, org } = attachParams;

  // Get usage based prices
  let itemsToInvoice = [];
  for (const cp of customer_prices) {
    let config = cp.price.config! as UsagePriceConfig;
    let relatedCusEnt = customer_entitlements.find(
      (cusEnt) =>
        cusEnt.entitlement.internal_feature_id === config.internal_feature_id
    );

    if (
      !relatedCusEnt ||
      !relatedCusEnt.usage_allowed ||
      !relatedCusEnt.balance
    ) {
      continue;
    }

    if (relatedCusEnt?.balance > 0) {
      continue;
    }

    // Amount to bill?
    let usage = relatedCusEnt?.entitlement.allowance! - relatedCusEnt?.balance!;
    let overage = -relatedCusEnt?.balance!;

    if (getBillingType(config) === BillingType.UsageInArrear) {
      itemsToInvoice.push({
        overage,
        usage,
        featureId: relatedCusEnt?.entitlement.feature.id,
        price: cp.price,
        relatedCusEnt,
      });
    }
  }

  if (itemsToInvoice.length === 0) {
    return;
  }

  // 1. Create invoice
  const stripeCli = createStripeCli({
    org: org,
    env: customer.env,
  });

  const invoice = await stripeCli.invoices.create({
    customer: customer.processor.id,
    auto_advance: true,
  });

  // 2. Add items to invoice
  console.log("Bill for remaining usages");
  for (const item of itemsToInvoice) {
    const amount = getPriceForOverage(item.price, item.overage);

    console.log(
      `   feature: ${item.featureId}, overage: ${item.overage}, amount: ${amount}`
    );

    await stripeCli.invoiceItems.create({
      customer: customer.processor.id,
      amount: Math.round(amount * 100),
      invoice: invoice.id,
      currency: org.default_currency,
      description: `${curCusProduct.product.name} - ${
        item.featureId
      } x ${Math.round(item.overage)}`,
    });

    // Set cus ent to 0
    await CustomerEntitlementService.update({
      sb,
      id: item.relatedCusEnt!.id,
      updates: {
        balance: 0,
      },
    });
  }

  // Finalize and pay invoice
  const finalizedInvoice = await stripeCli.invoices.finalizeInvoice(invoice.id);
  const { paid, error } = await payForInvoice({
    fullOrg: org,
    env: customer.env,
    customer,
    invoice: finalizedInvoice,
  });

  if (!paid) {
    await stripeCli.invoices.voidInvoice(invoice.id);
    throw new RecaseError({
      message: "Failed to pay invoice for remaining usages",
      code: ErrCode.PayInvoiceFailed,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  let curProduct = curCusProduct.product;

  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice: finalizedInvoice,
    internalCustomerId: customer.internal_id,
    org: org,
    productIds: [curProduct.id],
    internalProductIds: [curProduct.internal_id],
  });
};

export const handleUpgrade = async ({
  req,
  res,
  attachParams,
  curCusProduct,
  curFullProduct,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
  curFullProduct: FullProduct;
}) => {
  const { org, customer, products } = attachParams;
  let product = products[0];

  console.log(
    `Upgrading ${curFullProduct.name} to ${product.name} for ${customer.id}`
  );

  const stripeCli = createStripeCli({ org, env: customer.env });

  // 1. If current product is free, retire old product
  if (isFreeProduct(curFullProduct.prices)) {
    console.log("NOTE: Current product is free, using add product flow");
    await handleAddProduct({
      req,
      res,
      attachParams,
    });
    return;
  }

  // 2. TO FIX: If current product is a trial, just start a new period (with new subscription_ids)
  if (curCusProduct.trial_ends_at && curCusProduct.trial_ends_at > Date.now()) {
    console.log(
      "NOTE: Current product is a trial, cancel and start new subscription"
    );

    await handleAddProduct({
      req,
      res,
      attachParams,
    });

    for (const subId of curCusProduct.subscription_ids!) {
      try {
        await stripeCli.subscriptions.cancel(subId);
      } catch (error) {
        throw new RecaseError({
          message: `Handling upgrade (cur product on trial): failed to cancel subscription ${subId}`,
          code: ErrCode.StripeCancelSubscriptionFailed,
          statusCode: StatusCodes.BAD_REQUEST,
          data: error,
        });
      }
    }
  }

  const disableFreeTrial = false;

  // 1. Bill for remaining usages
  console.log("1. Bill for remaining usages");
  await billForRemainingUsages({
    sb: req.sb,
    attachParams,
    curCusProduct,
  });

  console.log("2. Updating current subscription to new product");

  let { subUpdate, newSubIds, invoiceIds, remainingExistingSubIds } =
    await handleStripeSubUpdate({
      sb: req.sb,
      curCusProduct,
      stripeCli,
      attachParams,
      disableFreeTrial,
    });

  console.log(
    "2.1. Remove old subscription ID from old cus product and expire"
  );
  await CusProductService.update({
    sb: req.sb,
    cusProductId: curCusProduct.id,
    updates: {
      subscription_ids: curCusProduct.subscription_ids!.filter(
        (subId) => subId !== subUpdate.id
      ),
      processor: {
        ...curCusProduct.processor,
        subscription_id: null,
      } as any,
      status: CusProductStatus.Expired,
    },
  });

  if (remainingExistingSubIds && remainingExistingSubIds.length > 0) {
    console.log("2.2. Canceling old subscriptions");
    for (const subId of remainingExistingSubIds) {
      console.log("   - Cancelling old subscription", subId);
      await stripeCli.subscriptions.cancel(subId);
    }
  }

  // Handle backend
  console.log("3. Creating new full cus product");
  await createFullCusProduct({
    sb: req.sb,
    attachParams: attachToInsertParams(attachParams, products[0]),
    subscriptionIds: newSubIds,
    nextResetAt: subUpdate.current_period_end
      ? subUpdate.current_period_end * 1000
      : undefined,

    disableFreeTrial,
  });

  // Create invoices
  console.log("4. Creating invoices");
  console.log("Invoice IDs: ", invoiceIds);
  const batchInsertInvoice = [];
  for (const invoiceId of invoiceIds) {
    batchInsertInvoice.push(async () => {
      const stripeInvoice = await stripeCli.invoices.retrieve(invoiceId);
      await InvoiceService.createInvoiceFromStripe({
        sb: req.sb,
        stripeInvoice,
        internalCustomerId: customer.internal_id,
        org,
        productIds: [products[0].id],
        internalProductIds: [products[0].internal_id],
      });
    });
  }

  await Promise.all(batchInsertInvoice);
  console.log("✅ Done!");

  res.status(200).json({
    success: true,
    message: `Successfully attached ${product.name} to ${customer.name} -- upgraded from ${curFullProduct.name}`,
  });
};
