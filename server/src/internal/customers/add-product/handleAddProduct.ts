import {
  getBillLaterPrices,
  getBillNowPrices,
  getPriceOptions,
  pricesOnlyOneOff,
} from "@/internal/prices/priceUtils.js";

import {
  AppEnv,
  Customer,
  EntitlementWithFeature,
  FullProduct,
  Organization,
  Price,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { priceToStripeItem } from "@/external/stripe/stripePriceUtils.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { InvoiceService } from "../invoices/InvoiceService.js";
import { PricesInput } from "@autumn/shared";

const handleBillNowPrices = async ({
  sb,
  customer,
  product,
  prices,
  entitlements,
  pricesInput,
  org,
  env,
}: {
  sb: SupabaseClient;
  customer: Customer;
  product: FullProduct;
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  pricesInput: PricesInput;
  org: Organization;
  env: AppEnv;
}) => {
  console.log("Adding product to customer", customer.id, product.id);

  const billNowPrices = getBillNowPrices(prices);
  const stripeCli = createStripeCli({ org, env });

  const subItems = [];

  for (const price of billNowPrices) {
    const priceOption = getPriceOptions(price.id!, pricesInput);

    subItems.push(
      priceToStripeItem({
        price,
        product,
        org,
        options: priceOption,
      })
    );
  }

  const paymentMethod = await getCusPaymentMethod({
    org,
    env,
    stripeId: customer.processor.id,
  });

  let subscription;

  try {
    subscription = await stripeCli.subscriptions.create({
      customer: customer.processor.id,
      default_payment_method: paymentMethod as string,
      items: subItems as any,
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
    customer,
    product,
    prices,
    entitlements,
    pricesInput,
    subscriptionId: subscription.id,
  });

  // Add invoice
  const stripeInvoice = await stripeCli.invoices.retrieve(
    subscription.latest_invoice as string
  );

  await InvoiceService.createInvoiceFromStripe({
    sb,
    internalCustomerId: customer.internal_id,
    productIds: [product.id],
    stripeInvoice,
  });

  return cusProd;
};

export const handleAddProduct = async ({
  req,
  res,
  customer,
  product,
  prices,
  entitlements,
  pricesInput,
  org,
  env,
}: {
  req: any;
  res: any;
  customer: Customer;
  product: FullProduct;
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  pricesInput: PricesInput;
  org: Organization;
  env: AppEnv;
}) => {
  console.log(
    `No existing product, payment method found. Adding product ${product.name} to customer ${customer.id} manually...`
  );

  // 1. Handle one-off payment products
  if (pricesOnlyOneOff(prices)) {
    console.log("Handling one-off payment products");
    return;
  }

  // 2. Get one-off + fixed cycle prices
  const billNowPrices = getBillNowPrices(prices);

  if (billNowPrices.length > 0) {
    await handleBillNowPrices({
      sb: req.sb,
      customer,
      product,
      prices,
      entitlements,
      pricesInput,
      org,
      env,
    });

    res.status(200).send({ success: true });
    return;
  }

  const billLaterPrices = getBillLaterPrices(prices);

  await createFullCusProduct({
    sb: req.sb,
    customer,
    product,
    prices,
    entitlements,
    pricesInput,
    subscriptionId: undefined,
  });
  console.log("Creating bill later prices");

  res.status(200).send({ success: true });
};
