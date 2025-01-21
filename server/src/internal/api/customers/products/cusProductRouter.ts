import { Router } from "express";
import RecaseError from "@/utils/errorUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  AppEnv,
  Customer,
  Entitlement,
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
import { haveDifferentRecurringIntervals } from "@/internal/prices/priceUtils.js";
import { PricesInput } from "@autumn/shared";
import { handleChangeProduct } from "@/internal/customers/change-product/handleChangeProduct.js";
import { getFullCusProductData } from "./cusProductUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { handleAddFreeProduct } from "@/internal/customers/add-product/handleAddFreeProduct.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const cusProductApiRouter = Router({ mergeParams: true });

const checkAddProductErrors = async ({
  sb,
  customer,
  product,
  prices,
}: {
  sb: SupabaseClient;
  customer: Customer;
  product: FullProduct;
  prices: Price[];
}) => {
  // 1. Check if product has different recurring intervals
  if (haveDifferentRecurringIntervals(prices)) {
    throw new RecaseError({
      message: `Product ${product.id} has different recurring intervals`,
      code: ErrCode.ProductHasDifferentRecurringIntervals,
      statusCode: 400,
    });
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

  // 2. Check if customer already has product
  if (existingCusProduct?.product_id === product.id && !product.is_add_on) {
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

cusProductApiRouter.post("", async (req: any, res) => {
  const { customer_id } = req.params;
  const { product_id, prices, entitlements } = req.body;
  const { orgId, env } = req;

  const sb = req.sb;
  const pricesInput: PricesInput = prices || [];
  const entsInput: Entitlement[] = entitlements || [];

  console.log("--------------------------------");
  console.log("Add product request received");
  try {
    // 1. Get full customer product data
    const { customer, product, org, prices, entitlements, features } =
      await getFullCusProductData({
        sb,
        customerId: customer_id,
        productId: product_id,
        orgId,
        env,
        pricesInput,
        entsInput,
      });

    await checkStripeConnections({ req, res, customer, product, org, env });

    // 2. Check for add product errors -- different recurring intervals, already has product
    await checkAddProductErrors({
      sb: req.sb,
      customer,
      product,
      prices,
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
      `Current cus product: ${curCusProduct?.product.name || "None"}`
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
        pricesInput,
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
        pricesInput,
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
        pricesInput,
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
      pricesInput,
      org,
      env,
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
