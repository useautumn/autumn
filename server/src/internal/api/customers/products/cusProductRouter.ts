import { Router } from "express";
import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  BillingType,
  Customer,
  Entitlement,
  EntitlementWithFeature,
  FeatureOptions,
  FullProduct,
  Organization,
  Price,
  ProcessorType,
} from "@autumn/shared";
import { ErrCode } from "@/errors/errCodes.js";
import {
  createStripeCustomer,
  getCusPaymentMethod,
} from "@/external/stripe/stripeCusUtils.js";
import { handleAddProduct } from "@/internal/customers/add-product/handleAddProduct.js";
import { ErrorMessages } from "@/errors/errMessages.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  getEntOptions,
  getPriceEntitlement,
  haveDifferentRecurringIntervals,
} from "@/internal/prices/priceUtils.js";
import { PricesInput } from "@autumn/shared";
import { getFullCusProductData } from "./cusProductUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { handleAddFreeProduct } from "@/internal/customers/add-product/handleAddFreeProduct.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { handleChangeProduct } from "@/internal/customers/change-product/handleChangeProduct.js";
import chalk from "chalk";

export const attachRouter = Router();

const checkAddProductErrors = async ({
  product,
  prices,
  entitlements,
  optionsList,
}: {
  product: FullProduct;
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  optionsList: FeatureOptions[];
}) => {
  // 1. Check if product has different recurring intervals
  if (haveDifferentRecurringIntervals(prices)) {
    throw new RecaseError({
      message: `Product ${product.id} has different recurring intervals`,
      code: ErrCode.ProductHasDifferentRecurringIntervals,
      statusCode: 400,
    });
  }

  // 2. Check if options are valid
  for (const price of prices) {

    if (price.billing_type === BillingType.UsageInAdvance) {
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
    } else if (price.billing_type === BillingType.UsageBelowThreshold) {
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

const handleExistingProduct = async ({
  req,
  res,
  org,
  env,
  customer,
  product,
}: {
  req: any;
  res: any;
  org: Organization;
  env: AppEnv;
  customer: Customer;
  product: FullProduct;
}) => {
  const { sb } = req;
  const existingCusProduct = await CusProductService.getCurrentProduct({
    sb,
    internalCustomerId: customer.internal_id,
  });

  // 2. Don't allow customer to get multiple of the same product
  if (existingCusProduct?.product_id === product.id) {
    // If there's a future product, delete, else
    const deletedCusProduct = await CusProductService.deleteFutureProduct({
      sb,
      internalCustomerId: customer.internal_id,
    });

    if (deletedCusProduct) {
      const stripeCli = createStripeCli({ org, env });
      if (deletedCusProduct.processor.subscription_schedule_id) {
        await stripeCli.subscriptionSchedules.cancel(
          deletedCusProduct.processor.subscription_schedule_id
        );
      }
      // Continue current product subscription
      if (existingCusProduct.processor.subscription_id) {
        await stripeCli.subscriptions.update(
          existingCusProduct.processor.subscription_id,
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
      });
      return true;
    } else {
      throw new RecaseError({
        message: `Customer ${customer.id} already has product ${existingCusProduct.product_id}`,
        code: ErrCode.CustomerAlreadyHasProduct,
        statusCode: 400,
      });
    }
  }

  // 3. If no existing product, check if new product is add-on
  if (!existingCusProduct && product.is_add_on) {
    throw new RecaseError({
      message: `Customer has no base product`,
      code: ErrCode.CustomerHasNoBaseProduct,
      statusCode: 400,
    });
  }

  return existingCusProduct;
};

const checkStripeConnections = async ({
  req,
  res,
  customer,
  product,
  org,
  env,
}: {
  req: any;
  res: any;
  customer: Customer;
  product: FullProduct;
  org: Organization;
  env: AppEnv;
}) => {
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
};

attachRouter.post("", async (req: any, res) => {
  const { customer_id, product_id, prices, entitlements, options } = req.body;
  const { orgId, env } = req;

  const sb = req.sb;
  const pricesInput: PricesInput = prices || [];
  const entsInput: Entitlement[] = entitlements || [];
  const optionsListInput: FeatureOptions[] = options || [];
  console.log("--------------------------------");
  console.log("Add product request received");

  try {
    // 1. Get full customer product data
    const {
      customer,
      product,
      org,
      prices,
      entitlements,
      features,
      optionsList,
    } = await getFullCusProductData({
      sb,
      customerId: customer_id,
      productId: product_id,
      orgId,
      env,
      pricesInput,
      entsInput,
      optionsListInput,
    });

    await checkStripeConnections({ req, res, customer, product, org, env });

    // 2. Check for add product errors -- different recurring intervals and invalid options
    await checkAddProductErrors({
      product,
      prices,
      entitlements,
      optionsList,
    });

    const curCusProduct = await handleExistingProduct({
      req,
      res,
      org,
      env,
      customer,
      product,
    });

    if (curCusProduct === true) {
      return;
    }

    console.log(
      `Current cus product: ${chalk.yellow(
        curCusProduct?.product.name || "None"
      )}`
    );

    // 3. Handle free product, no existing product
    if (!curCusProduct && isFreeProduct(prices)) {
      await handleAddFreeProduct({
        req,
        res,
        customer,
        product,
        org,
        env,
        prices,
        entitlements,
        optionsList,
      });
      return;
    }

    // 4. Handle no payment method, checkout required
    const paymentMethod = await getCusPaymentMethod({
      org,
      env,
      stripeId: customer.processor.id,
    });

    if (!paymentMethod) {
      await handleCreateCheckout({
        req,
        res,
        customer,
        product,
        prices,
        org,
        env,
        entitlements,
        optionsList,
      });
      return;
    }

    // 3. Handle change product
    if (!product.is_add_on && curCusProduct) {
      await handleChangeProduct({
        req,
        res,
        customer,
        product,
        curCusProduct,
        prices,
        entitlements,
        org,
        env,
        features,
        optionsList,
      });

      return;
    }

    // 4. If customer doesn't have payment method, create Stripe checkout
    await handleAddProduct({
      req,
      res,
      customer,
      product,
      prices,
      entitlements,
      org,
      env,
      optionsList,
    });
  } catch (error: any) {
    if (error instanceof RecaseError) {
      error.print();
      res.status(error.statusCode).send({
        message: error.message,
        code: error.code,
      });
    } else {
      console.log("Unknown error:", error);
      res.status(500).send({
        error: ErrCode.InternalError,
        message: ErrorMessages.InternalError,
      });
    }
  }
});
