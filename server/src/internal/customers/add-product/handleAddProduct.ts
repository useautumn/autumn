import {
  getBillLaterPrices,
  getBillNowPrices,
  getPriceEntitlement,
  getPriceOptions,
  pricesOnlyOneOff,
} from "@/internal/prices/priceUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import chalk from "chalk";

import { SupabaseClient } from "@supabase/supabase-js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { AttachParams } from "../products/AttachParams.js";
import { getPriceAmount } from "../../prices/priceUtils.js";
import { AllowanceType, ErrCode, InvoiceStatus } from "@autumn/shared";
import { InvoiceService } from "../invoices/InvoiceService.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { createStripeSubscription } from "@/external/stripe/stripeSubUtils.js";
import { handleCreateCheckout } from "./handleCreateCheckout.js";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";

const handleBillNowPrices = async ({
  sb,
  attachParams,
  res,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
  res: any;
}) => {
  const { org, customer, product, freeTrial } = attachParams;

  const stripeCli = createStripeCli({ org, env: customer.env });

  const { items, itemMetas } = await getStripeSubItems({
    attachParams,
  });

  let subscription;
  console.log("Creating subscription");
  try {
    subscription = await createStripeSubscription({
      stripeCli,
      customer,
      org,
      items,
      freeTrial,
    });
  } catch (error: any) {
    if (
      error instanceof RecaseError &&
      error.code === ErrCode.StripeCardDeclined
    ) {
      await handleCreateCheckout({
        sb,
        res,
        attachParams,
      });
      return;
    }

    throw error;
  }

  // Add product and entitlements to customer
  const cusProd = await createFullCusProduct({
    sb,
    attachParams,
    subscriptionId: subscription.id,
  });

  // Create invoice
  const latestInvoice = await stripeCli.invoices.retrieve(
    subscription.latest_invoice as string
  );

  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice: latestInvoice,
    internalCustomerId: customer.internal_id,
    productIds: [product.id],
    internalProductIds: [product.internal_id],
    org: org,
  });

  res.status(200).send({ success: true });
};

const handleOneOffPrices = async ({
  sb,
  attachParams,
  res,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
  res: any;
}) => {
  const { org, customer, product, prices, optionsList, entitlements } =
    attachParams;

  // 1. Create invoice
  const stripeCli = createStripeCli({ org, env: customer.env });

  console.log("   1. Creating invoice");
  const stripeInvoice = await stripeCli.invoices.create({
    customer: customer.processor.id,
    auto_advance: true,
  });

  // 2. Create invoice items
  for (const price of prices) {
    // Calculate amount
    const options = getPriceOptions(price, optionsList);
    const entitlement = getPriceEntitlement(price, entitlements);
    const { amountPerUnit, quantity } = getPriceAmount(price, options!);

    let allowanceStr = "";
    if (entitlement) {
      allowanceStr =
        entitlement.allowance_type == AllowanceType.Unlimited
          ? "Unlimited"
          : entitlement.allowance_type == AllowanceType.None
          ? "None"
          : `${entitlement.allowance}`;
      allowanceStr = `x ${allowanceStr} (${entitlement.feature.name})`;
    }

    await stripeCli.invoiceItems.create({
      customer: customer.processor.id,
      amount: amountPerUnit * quantity * 100,
      invoice: stripeInvoice.id,
      description: `Invoice for ${product.name} -- ${quantity}${allowanceStr}`,
    });
  }

  const finalizedInvoice = await stripeCli.invoices.finalizeInvoice(
    stripeInvoice.id
  );

  console.log("   2. Paying invoice");
  const { paid, error } = await payForInvoice({
    fullOrg: org,
    env: customer.env,
    customer: customer,
    invoice: stripeInvoice,
  });

  if (!paid) {
    if (error!.code === ErrCode.StripeCardDeclined) {
      await stripeCli.invoices.voidInvoice(stripeInvoice.id);
      await handleCreateCheckout({
        sb,
        res,
        attachParams,
      });
    } else {
      throw error;
    }
  }

  // Insert full customer product
  console.log("   3. Creating full customer product");
  await createFullCusProduct({
    sb,
    attachParams,
    lastInvoiceId: finalizedInvoice.id,
  });

  console.log("   4. Creating invoice from stripe");
  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice: finalizedInvoice,
    internalCustomerId: customer.internal_id,
    productIds: [product.id],
    internalProductIds: [product.internal_id],
    status: InvoiceStatus.Paid,
    org: org,
  });

  console.log("   ✅ Successfully attached product");
  res.status(200).send({ success: true });
};

export const handleAddProduct = async ({
  req,
  res,
  attachParams,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
}) => {
  const { customer, product, prices } = attachParams;

  if (product.is_add_on) {
    console.log(
      `Adding add-on ${chalk.yellowBright(
        product.name
      )} to customer ${chalk.yellowBright(customer.id)}`
    );
  } else {
    console.log(
      `Adding product ${chalk.yellowBright(
        product.name
      )} to customer ${chalk.yellowBright(customer.id)}`
    );
  }

  // 1. Handle one-off payment products
  if (pricesOnlyOneOff(prices)) {
    console.log("Handling one-off payment products");
    await handleOneOffPrices({
      sb: req.sb,
      attachParams,
      res,
    });

    return;
  }

  // 2. Get one-off + fixed cycle prices
  const billNowPrices = getBillNowPrices(prices);

  if (billNowPrices.length > 0) {
    await handleBillNowPrices({
      sb: req.sb,
      attachParams,
      res,
    });

    return;
  }

  console.log("Creating bill later prices");

  const billLaterPrices = getBillLaterPrices(prices);

  await createFullCusProduct({
    sb: req.sb,
    attachParams,
    subscriptionId: undefined,
    billLaterOnly: true,
  });

  console.log("Successfully created full cus product");

  res.status(200).send({ success: true });
};
