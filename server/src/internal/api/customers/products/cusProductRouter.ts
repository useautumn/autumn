import { Router } from "express";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { z } from "zod";
import {
  BillingInterval,
  BillingType,
  Entitlement,
  FeatureOptions,
  FeatureOptionsSchema,
  Price,
  ProcessorType,
  UsagePriceConfig,
} from "@autumn/shared";
import { ErrCode } from "@/errors/errCodes.js";
import {
  createStripeCustomer,
  getCusPaymentMethod,
} from "@/external/stripe/stripeCusUtils.js";
import { handleAddProduct } from "@/internal/customers/add-product/handleAddProduct.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  getBillingType,
  getEntOptions,
  getPriceEntitlement,
  haveDifferentRecurringIntervals,
} from "@/internal/prices/priceUtils.js";
import { PricesInput } from "@autumn/shared";
import { getFullCusProductData } from "../../../customers/products/cusProductUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { handleAddFreeProduct } from "@/internal/customers/add-product/handleAddFreeProduct.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { handleChangeProduct } from "@/internal/customers/change-product/handleChangeProduct.js";
import chalk from "chalk";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import {
  createStripeInAdvancePrice,
  createStripeInArrearPrice,
  createStripePriceIFNotExist,
} from "@/external/stripe/stripePriceUtils.js";
import { handleInvoiceOnly } from "@/internal/customers/add-product/handleInvoiceOnly.js";

export const attachRouter = Router();

export const checkoutPricesValid = (prices: Price[]) => {
  for (const price of prices) {
    if (price.billing_type === BillingType.UsageBelowThreshold) {
      return false;
    }
  }

  return true;
};

export const checkAddProductErrors = async ({
  attachParams,
  useCheckout = false,
}: {
  attachParams: AttachParams;
  useCheckout?: boolean;
}) => {
  const { product, prices, entitlements, optionsList } = attachParams;

  // 1. Check if product has different recurring intervals
  if (haveDifferentRecurringIntervals(prices)) {
    throw new RecaseError({
      message: `Product ${product.id} has different recurring intervals`,
      code: ErrCode.ProductHasDifferentRecurringIntervals,
      statusCode: 400,
    });
  }

  if (useCheckout && !checkoutPricesValid(prices)) {
    throw new RecaseError({
      message: `Can't use /checkout for below threshold prices`,
      code: ErrCode.InvalidRequest,
      statusCode: 400,
    });
  }

  // 2. Check if options are valid

  for (const price of prices) {
    const billingType = getBillingType(price.config!);
    if (billingType === BillingType.UsageInAdvance && !useCheckout) {
      // Get options for price
      let priceEnt = getPriceEntitlement(price, entitlements);
      let options = getEntOptions(optionsList, priceEnt);
      if (!options?.quantity) {
        throw new RecaseError({
          message: `Pass in 'quantity' for feature ${priceEnt.feature_id} in options`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }
    } else if (billingType === BillingType.UsageBelowThreshold) {
      let priceEnt = getPriceEntitlement(price, entitlements);
      let options = getEntOptions(optionsList, priceEnt);

      if (!options?.threshold) {
        throw new RecaseError({
          message: `Pass in 'threshold' for feature '${priceEnt.feature_id}' in options`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }
    }
  }
};

export const handleExistingProduct = async ({
  req,
  res,
  attachParams,
  useCheckout = false,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  useCheckout?: boolean;
}) => {
  const { sb } = req;
  const { customer, product, org } = attachParams;
  const env = customer.env;

  // 1. Fetch existing product by group
  const currentProduct = await CusProductService.getCurrentProductByGroup({
    sb,
    internalCustomerId: customer.internal_id,
    productGroup: product.group,
  });

  console.log(
    `Current cus product: ${chalk.yellow(
      currentProduct?.product.name || "None"
    )}`
  );

  // 2. If same product, delete future product or throw error
  if (currentProduct?.product.internal_id === product.internal_id) {
    // If there's a future product, delete, else
    const deletedCusProduct = await CusProductService.deleteFutureProduct({
      sb,
      internalCustomerId: customer.internal_id,
      productGroup: product.group,
    });

    if (deletedCusProduct) {
      const stripeCli = createStripeCli({ org, env });
      if (deletedCusProduct.processor.subscription_schedule_id) {
        await stripeCli.subscriptionSchedules.cancel(
          deletedCusProduct.processor.subscription_schedule_id
        );
      }
      // Continue current product subscription
      if (currentProduct.processor.subscription_id) {
        await stripeCli.subscriptions.update(
          currentProduct.processor.subscription_id,
          {
            cancel_at_period_end: false,
          }
        );
      }

      console.log(
        "Added product same as current product, deleted future product"
      );

      res.status(200).send({
        success: true,
        message: "Reactivated current product, removed future product",
      });
      return {
        done: true,
        currentProduct,
      };
    } else {
      throw new RecaseError({
        message: `Customer ${customer.id} already has product ${currentProduct.product_id}`,
        code: ErrCode.CustomerAlreadyHasProduct,
        statusCode: 400,
      });
    }
  }

  // 3. If no existing product, check if new product is add-on
  if (!currentProduct && product.is_add_on) {
    throw new RecaseError({
      message: `Customer has no base product`,
      code: ErrCode.CustomerHasNoBaseProduct,
      statusCode: 400,
    });
  }

  const curPrices =
    currentProduct?.customer_prices.map((cp: any) => cp.price) || [];
  // If there's current product and it's not free and new product is a switch
  if (
    currentProduct &&
    !isFreeProduct(curPrices) &&
    !product.is_add_on &&
    useCheckout
  ) {
    throw new RecaseError({
      message: `Can't use checkout for upgrades / downgrades`,
      code: ErrCode.InvalidRequest,
      statusCode: 400,
    });
  }

  return { currentProduct, done: false };
};

export const checkStripeConnections = async ({
  req,
  res,
  attachParams,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
}) => {
  const { org, customer, product, prices, entitlements } = attachParams;
  const env = customer.env;

  if (!org.stripe_connected) {
    throw new RecaseError({
      message: "Please connect to Stripe to add products",
      code: ErrCode.StripeConfigNotFound,
      statusCode: 400,
    });
  }

  const stripeCli = createStripeCli({ org, env });

  if (!customer.processor || !customer.processor.id) {
    const stripeCustomer = await createStripeCustomer({ org, env, customer });

    await CusService.update({
      sb: req.sb,
      internalCusId: customer.internal_id,
      update: {
        processor: {
          id: stripeCustomer.id,
          type: ProcessorType.Stripe,
        },
      },
    });

    customer.processor = {
      id: stripeCustomer.id,
      type: ProcessorType.Stripe,
    };
  }

  if (!product.processor || !product.processor.id) {
    const stripeProduct = await stripeCli.products.create({
      name: product.name,
    });

    await ProductService.update({
      sb: req.sb,
      productId: product.id,
      orgId: org.id,
      env,
      update: {
        processor: {
          id: stripeProduct.id,
          type: ProcessorType.Stripe,
        },
      },
    });

    product.processor = {
      id: stripeProduct.id,
      type: ProcessorType.Stripe,
    };
  }

  const batchPriceUpdates = [];
  for (const price of prices) {
    batchPriceUpdates.push(
      createStripePriceIFNotExist({
        sb: req.sb,
        stripeCli,
        price,
        entitlements,
        product,
        org,
      })
    );
  }
  await Promise.all(batchPriceUpdates);
};

attachRouter.post("/attach", async (req: any, res) => {
  const {
    customer_id,
    product_id,
    customer_data,

    is_custom,
    prices,
    entitlements,
    free_trial,
    options,
    force_checkout,
    invoice_only,
  } = req.body;

  const { orgId, env } = req;

  const sb = req.sb;
  const pricesInput: PricesInput = prices || [];
  const entsInput: Entitlement[] = entitlements || [];
  const optionsListInput: FeatureOptions[] = options || [];
  const invoiceOnly = invoice_only || false;

  const useCheckout = force_checkout || false;
  console.log("--------------------------------");
  console.log(`ATTACH PRODUCT REQUEST (from ${req.minOrg.slug})`);

  try {
    z.array(FeatureOptionsSchema).parse(optionsListInput);
    // 1. Get full customer product data
    const attachParams = await getFullCusProductData({
      sb,
      customerId: customer_id,
      productId: product_id,
      customerData: customer_data,
      orgId,
      env,
      pricesInput,
      entsInput,
      optionsListInput,
      freeTrialInput: free_trial,
      isCustom: is_custom,
    });

    // -------------------- ERROR CHECKING --------------------

    // 1. Check for normal errors (eg. options, different recurring intervals)
    await checkAddProductErrors({
      attachParams,
      useCheckout,
    });

    console.log(
      `Customer: ${chalk.yellow(
        `${attachParams.customer.id} (${attachParams.customer.name})`
      )}`
    );

    // 2. Check for existing product and fetch
    const { currentProduct, done } = await handleExistingProduct({
      req,
      res,
      attachParams,
      useCheckout,
    });

    if (done) return;

    // 3. Check for stripe connection
    await checkStripeConnections({ req, res, attachParams });

    // -------------------- ATTACH PRODUCT --------------------

    // SCENARIO 1: Free product, no existing product

    const curProductFree = isFreeProduct(
      currentProduct?.customer_prices.map((cp: any) => cp.price) || [] // if no current product...
    );
    const newProductFree = isFreeProduct(attachParams.prices);

    if (
      (!currentProduct && newProductFree) ||
      (curProductFree && newProductFree) ||
      (attachParams.product.is_add_on && newProductFree)
    ) {
      console.log("SCENARIO 1: FREE PRODUCT");
      await handleAddFreeProduct({
        req,
        res,
        attachParams,
      });
      return;
    }

    // SCENARIO 2: Invoice only
    if (invoiceOnly) {
      await handleInvoiceOnly({
        req,
        res,
        attachParams,
        curCusProduct: currentProduct,
      });
      return;
    }

    // SCENARIO 3: No payment method, checkout required
    const paymentMethod = await getCusPaymentMethod({
      org: attachParams.org,
      env: attachParams.customer.env,
      stripeId: attachParams.customer.processor.id,
    });

    if (!paymentMethod || useCheckout) {
      console.log("SCENARIO 2: NO PAYMENT METHOD, CHECKOUT REQUIRED");
      await handleCreateCheckout({
        sb,
        res,
        attachParams,
      });
      return;
    }

    // SCENARIO 4: Switching product
    if (!attachParams.product.is_add_on && currentProduct) {
      console.log("SCENARIO 3: SWITCHING PRODUCT (PAYMENT METHOD EXISTS)");
      await handleChangeProduct({
        req,
        res,
        attachParams,
        curCusProduct: currentProduct,
      });
      return;
    }

    // SCENARIO 5: No existing product, not free product
    console.log("SCENARIO 4: ADDING PRODUCT");
    await handleAddProduct({
      req,
      res,
      attachParams,
    });
  } catch (error: any) {
    handleRequestError({ req, res, error, action: "attach product" });
  }
});
