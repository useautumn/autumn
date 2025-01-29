import {
  getBillLaterPrices,
  getBillNowPrices,
  getPriceEntitlement,
  getPriceOptions,
  getStripeSubItems,
  pricesOnlyOneOff,
} from "@/internal/prices/priceUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import chalk from "chalk";

import { SupabaseClient } from "@supabase/supabase-js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";

import { ErrCode } from "@/errors/errCodes.js";
import { AttachParams } from "../products/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getPriceAmount } from "../../prices/priceUtils.js";
import { AllowanceType, InvoiceStatus } from "@autumn/shared";
import { InvoiceService } from "../invoices/InvoiceService.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";

const handleBillNowPrices = async ({
  sb,
  attachParams,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
}) => {
  const { org, customer, product, freeTrial } = attachParams;

  console.log("Adding product to customer", customer.id, product.id);

  const stripeCli = createStripeCli({ org, env: customer.env });

  const subItems = getStripeSubItems({
    attachParams,
  });

  const paymentMethod = await getCusPaymentMethod({
    org,
    env: customer.env,
    stripeId: customer.processor.id,
  });

  let subscription;

  try {
    subscription = await stripeCli.subscriptions.create({
      customer: customer.processor.id,
      default_payment_method: paymentMethod as string,
      items: subItems as any,
      trial_end: freeTrialToStripeTimestamp(freeTrial),
    });
  } catch (error: any) {
    console.log("Error creating stripe subscription", error?.message || error);

    throw new RecaseError({
      code: ErrCode.CreateStripeSubscriptionFailed,
      message: "Failed to create stripe subscription",
      statusCode: 500,
    });
  }

  // Add product and entitlements to customer
  const cusProd = await createFullCusProduct({
    sb,
    attachParams,
    subscriptionId: subscription.id,
  });

  // // Add invoice
  // const stripeInvoice = await stripeCli.invoices.retrieve(
  //   subscription.latest_invoice as string
  // );

  // await InvoiceService.createInvoiceFromStripe({
  //   sb,
  //   internalCustomerId: customer.internal_id,
  //   productIds: [product.id],
  //   stripeInvoice,
  // });

  return cusProd;
};

const handleOneOffPrices = async ({
  sb,
  attachParams,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
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

    const allowanceStr =
      entitlement.allowance_type == AllowanceType.Unlimited
        ? "Unlimited"
        : entitlement.allowance_type == AllowanceType.None
        ? "None"
        : `${entitlement.allowance}`;

    await stripeCli.invoiceItems.create({
      customer: customer.processor.id,
      amount: amountPerUnit * quantity * 100,
      invoice: stripeInvoice.id,
      description: `Invoice for ${product.name} -- ${quantity}x ${allowanceStr} (${entitlement.feature.name})`,
    });
  }

  const finalizedInvoice = await stripeCli.invoices.finalizeInvoice(
    stripeInvoice.id
  );

  console.log("   2. Paying invoice");
  const paid = await payForInvoice({
    fullOrg: org,
    env: customer.env,
    customer: customer,
    invoice: stripeInvoice,
  });

  if (!paid) {
    await stripeCli.invoices.voidInvoice(stripeInvoice.id);
    throw new RecaseError({
      code: ErrCode.PayInvoiceFailed,
      message: "Failed to pay invoice",
      statusCode: 500,
    });
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
    status: InvoiceStatus.Paid,
  });

  console.log("   ✅ Successfully attached product");
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
    });

    res.status(200).send({ success: true });
    return;
  }

  // throw new Error("Test");

  // 2. Get one-off + fixed cycle prices
  const billNowPrices = getBillNowPrices(prices);

  if (billNowPrices.length > 0) {
    await handleBillNowPrices({
      sb: req.sb,
      attachParams,
    });

    res.status(200).send({ success: true });
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
