import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeSubItems } from "@/internal/prices/priceUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
  isFreeProduct,
  isProductUpgrade,
  isSameBillingInterval,
} from "@/internal/products/productUtils.js";
import Stripe from "stripe";

import {
  AppEnv,
  CusProductWithProduct,
  EntitlementWithFeature,
  Feature,
  FeatureOptions,
  FullProduct,
  Organization,
  Price,
  PricesInput,
} from "@autumn/shared";

import { Customer } from "@autumn/shared";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { InvoiceService } from "../invoices/InvoiceService.js";
import { handleAddProduct } from "../add-product/handleAddProduct.js";
import { CusProductService } from "../products/CusProductService.js";

const scheduleStripeSubscription = async ({
  customer,
  product,
  prices,
  optionsList,
  entitlements,
  endOfBillingPeriod,
  org,
  env,
}: {
  customer: Customer;
  product: FullProduct;
  prices: Price[];
  optionsList: FeatureOptions[];
  entitlements: EntitlementWithFeature[];
  endOfBillingPeriod: number;
  org: Organization;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({ org, env });

  const stripeSubItems = getStripeSubItems({
    prices,
    product,
    org,
    optionsList,
    entitlements,
  });

  const paymentMethod = await getCusPaymentMethod({
    org,
    env,
    stripeId: customer.processor.id,
  });

  const newSubscriptionSchedule = await stripeCli.subscriptionSchedules.create({
    customer: customer.processor.id,
    start_date: endOfBillingPeriod,
    phases: [
      {
        items: stripeSubItems,
        default_payment_method: paymentMethod as string,
      },
    ],
  });

  return newSubscriptionSchedule.id;
};

const handleDowngrade = async ({
  req,
  res,
  customer,
  product,
  curCusProduct,
  optionsList,
  prices,
  entitlements,
  org,
  env,
}: {
  req: any;
  res: any;
  customer: Customer;
  product: FullProduct;
  org: Organization;
  env: AppEnv;
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  optionsList: FeatureOptions[];
  curCusProduct: CusProductWithProduct;
}) => {
  console.log(
    `Handling downgrade from ${curCusProduct.product.name} to ${product.name}`
  );

  // 1. Cancel current subscription
  console.log("1. Cancelling current subscription (at period end)");
  const stripeCli = createStripeCli({ org, env });
  const subscription = await stripeCli.subscriptions.retrieve(
    curCusProduct.processor?.subscription_id!
  );

  await stripeCli.subscriptions.update(subscription.id, {
    cancel_at_period_end: true,
  });

  // 3. Schedule new subscription IF new product is not free...
  console.log("2. Scheduling new subscription");
  let scheduleId;
  if (!isFreeProduct(prices)) {
    // Delete previous schedules
    const schedules = await stripeCli.subscriptionSchedules.list({
      customer: customer.processor.id,
    });

    for (const schedule of schedules.data) {
      const existingCusProduct = await CusProductService.getByScheduleId({
        sb: req.sb,
        scheduleId: schedule.id,
      });

      // Delete only if not in the same group
      if (
        (!existingCusProduct ||
          existingCusProduct.product.group === product.group) &&
        schedule.status !== "canceled"
      ) {
        await stripeCli.subscriptionSchedules.cancel(schedule.id);
      }
    }

    scheduleId = await scheduleStripeSubscription({
      customer,
      product,
      prices,
      optionsList,
      entitlements,
      endOfBillingPeriod: subscription.current_period_end,
      org,
      env,
    });
  }

  // 2. Insert new full cus product with starts_at later than current billing period
  console.log("3. Inserting new full cus product (starts at period end)");
  await createFullCusProduct({
    sb: req.sb,
    customer,
    product,
    prices,
    entitlements,
    optionsList,
    subscriptionId: undefined,
    startsAt: subscription.current_period_end * 1000,
    subscriptionScheduleId: scheduleId,
    nextResetAt: subscription.current_period_end * 1000,
  });

  res.status(200).json({ success: true, message: "Downgrade handled" });
};

// UPGRADE FUNCTIONS
const updateStripeSubscription = async ({
  stripeCli,
  subscriptionId,
  product,
  prices,
  optionsList,
  entitlements,
  org,
}: {
  stripeCli: Stripe;
  subscriptionId: string;
  product: FullProduct;
  prices: Price[];
  optionsList: FeatureOptions[];
  entitlements: EntitlementWithFeature[];
  org: Organization;
}) => {
  // HANLDE UPGRADE

  const subscription = await stripeCli.subscriptions.retrieve(subscriptionId);

  // Get stripe subscription from product
  const stripeSubItems = getStripeSubItems({
    prices,
    product,
    org,
    optionsList,
    entitlements,
  });

  // Delete existing subscription items
  for (const item of subscription.items.data) {
    stripeSubItems.push({
      id: item.id,
      deleted: true,
    });
  }

  // Switch subscription
  const subUpdate = await stripeCli.subscriptions.update(subscriptionId, {
    items: stripeSubItems,
    proration_behavior: "always_invoice",
  });

  return subUpdate;
};

const handleUpgrade = async ({
  req,
  res,
  customer,
  product,
  prices,
  entitlements,
  optionsList,
  curCusProduct,
  curFullProduct,
  org,
  env,
}: {
  req: any;
  res: any;
  customer: Customer;
  product: FullProduct;
  org: Organization;
  env: AppEnv;
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  optionsList: FeatureOptions[];
  curCusProduct: CusProductWithProduct;
  curFullProduct: FullProduct;
}) => {
  console.log(
    `Handling upgrade from ${curFullProduct.name} to ${product.name} for ${customer.id}`
  );

  const sameBillingInterval = isSameBillingInterval(curFullProduct, product);

  const stripeCli = createStripeCli({ org, env });

  // 1. If current product is free, retire old product
  if (isFreeProduct(curFullProduct.prices)) {
    console.log("NOTE: Current product is free, using add product flow");
    await handleAddProduct({
      req,
      res,
      customer,
      product,
      prices,
      entitlements,
      optionsList,
      org,
      env,
    });
    return;
  }

  // Maybe do it such that if cur cus product has no subscription ID, we just create a new one?

  console.log("1. Updating current subscription to new product");
  const subUpdate = await updateStripeSubscription({
    subscriptionId: curCusProduct.processor?.subscription_id!,
    stripeCli,
    product,
    prices,
    optionsList,
    entitlements,
    org,
  });

  // Handle backend
  console.log("2. Creating new full cus product");
  await createFullCusProduct({
    sb: req.sb,
    customer,
    product,
    prices,
    entitlements,
    optionsList,
    subscriptionId: subUpdate.id,
    nextResetAt: sameBillingInterval
      ? subUpdate.current_period_end * 1000
      : undefined,
  });

  // 5. Create invoice
  console.log("4. Creating invoice");
  const latestInvoice = await stripeCli.invoices.retrieve(
    subUpdate.latest_invoice as string
  );

  await InvoiceService.createInvoiceFromStripe({
    sb: req.sb,
    stripeInvoice: latestInvoice,
    internalCustomerId: customer.internal_id,
    productIds: [product.id],
  });

  res.status(200).json({ success: true, message: "Product change handled" });
};

export const handleChangeProduct = async ({
  req,
  res,
  customer,
  org,
  product,
  prices,
  entitlements,
  optionsList,
  curCusProduct,
  env,
}: {
  req: any;
  res: any;
  customer: Customer;
  product: FullProduct;
  org: Organization;
  features: Feature[];
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  optionsList: FeatureOptions[];
  env: AppEnv;
  curCusProduct: CusProductWithProduct;
}) => {
  console.log("Handling change product");

  // Get subscription
  const curProduct = curCusProduct.product;
  const curFullProduct = await ProductService.getFullProduct({
    sb: req.sb,
    productId: curProduct.id,
    orgId: org.id,
    env,
  });

  const isUpgrade = isProductUpgrade(curFullProduct, product);

  if (!isUpgrade) {
    await handleDowngrade({
      req,
      res,
      customer,
      product,
      curCusProduct,
      prices,
      entitlements,
      optionsList,
      org,
      env,
    });
    return;
  } else {
    await handleUpgrade({
      req,
      res,
      customer,
      product,
      curCusProduct,
      prices,
      entitlements,
      optionsList,
      org,
      env,
      curFullProduct,
    });
  }
};
