import { Router } from "express";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { z } from "zod";
import {
  BillingType,
  Entitlement,
  FeatureOptions,
  FeatureOptionsSchema,
  FullCusProduct,
  Price,
  ProcessorType,
} from "@autumn/shared";
import { ErrCode } from "@/errors/errCodes.js";
import {
  createStripeCustomer,
  getCusPaymentMethod,
} from "@/external/stripe/stripeCusUtils.js";
import { handleAddProduct } from "@/internal/customers/add-product/handleAddProduct.js";

import {
  getBillingType,
  getEntOptions,
  getPriceEntitlement,
  priceIsOneOffAndTiered,
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
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import { createStripePriceIFNotExist } from "@/external/stripe/stripePriceUtils.js";
import { handleInvoiceOnly } from "@/internal/customers/add-product/handleInvoiceOnly.js";
import { notNullOrUndefined, nullOrUndefined } from "@/utils/genUtils.js";
import chalk from "chalk";
import { handleExistingProduct } from "@/internal/customers/add-product/handleExistingProduct.js";

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

  // // 1. Check if product has different recurring intervals
  // if (haveDifferentRecurringIntervals(prices)) {
  //   throw new RecaseError({
  //     message: `Product ${product.id} has different recurring intervals`,
  //     code: ErrCode.ProductHasDifferentRecurringIntervals,
  //     statusCode: 400,
  //   });
  // }

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
    if (
      priceIsOneOffAndTiered(price, getPriceEntitlement(price, entitlements))
    ) {
      if (billingType === BillingType.UsageInAdvance) {
        throw new RecaseError({
          message: `One off and tiered prices are not allowed for usage in advance`,
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }
    }

    if (billingType === BillingType.UsageInAdvance) {
      // Get options for price

      let priceEnt = getPriceEntitlement(price, entitlements);
      let options = getEntOptions(optionsList, priceEnt);

      // 1. If not checkout, quantity should be defined
      if (!useCheckout && nullOrUndefined(options?.quantity)) {
        throw new RecaseError({
          message: `Pass in 'quantity' for feature ${priceEnt.feature_id} in options`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }

      if (
        nullOrUndefined(options?.quantity) &&
        priceIsOneOffAndTiered(price, priceEnt)
      ) {
        throw new RecaseError({
          code: ErrCode.InvalidRequest,
          message:
            "Quantity is required for start of period price that is one off and tiered",
          statusCode: 400,
        });
      }

      // 2. Quantity must be >= feature allowance
      if (
        notNullOrUndefined(options?.quantity) &&
        priceEnt.allowance &&
        options!.quantity! < priceEnt.allowance
      ) {
        throw new RecaseError({
          message: `Quantity must be greater than or equal to allowance (${priceEnt.allowance})`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }

      // 2. If there's only one price, quantity must be greater than 0
      if (options?.quantity === 0 && prices.length === 1) {
        throw new RecaseError({
          message: `When there's only one price, quantity must be greater than 0`,
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

export const handlePublicAttachErrors = async ({
  curCusProduct,
  isPublic,
}: {
  curCusProduct: FullCusProduct | null;
  isPublic: boolean;
}) => {
  if (!isPublic) {
    return;
  }

  if (!curCusProduct) {
    return;
  }

  // 1. If on paid plan, not allowed to switch product
  const curProductFree = isFreeProduct(
    curCusProduct?.customer_prices.map((cp: any) => cp.price) || [] // if no current product...
  );

  if (!curProductFree) {
    throw new RecaseError({
      message: "Public attach: not allowed to upgrade / downgrade (from paid)",
      code: ErrCode.InvalidRequest,
      statusCode: 400,
    });
  }
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

export const customerHasPm = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  // SCENARIO 3: No payment method, checkout required
  const paymentMethod = await getCusPaymentMethod({
    org: attachParams.org,
    env: attachParams.customer.env,
    stripeId: attachParams.customer.processor.id,
  });

  return notNullOrUndefined(paymentMethod) ? true : false;
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
    success_url,
  } = req.body;

  const { orgId, env } = req;

  const sb = req.sb;
  const pricesInput: PricesInput = prices || [];
  const entsInput: Entitlement[] = entitlements || [];
  const optionsListInput: FeatureOptions[] = options || [];
  const invoiceOnly = invoice_only || false;
  const successUrl = success_url || undefined;

  // PUBLIC STUFF
  let forceCheckout = req.isPublic || force_checkout || false;
  let isCustom = is_custom || false;
  if (req.isPublic) {
    isCustom = false;
  }

  console.log("--------------------------------");
  let publicStr = req.isPublic ? "(Public) " : "";
  console.log(`${publicStr}ATTACH PRODUCT REQUEST (from ${req.minOrg.slug})`);

  try {
    z.array(FeatureOptionsSchema).parse(optionsListInput);
    const attachParams: AttachParams = await getFullCusProductData({
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
      isCustom,
    });
    attachParams.successUrl = successUrl;

    console.log(
      `Customer: ${chalk.yellow(
        `${attachParams.customer.id} (${attachParams.customer.name})`
      )}`
    );

    // 3. Check for stripe connection
    await checkStripeConnections({ req, res, attachParams });

    let hasPm = await customerHasPm({ attachParams });
    const useCheckout = !hasPm || forceCheckout;

    console.log(
      `Has PM: ${chalk.yellow(hasPm)}, Force Checkout: ${chalk.yellow(
        forceCheckout
      )}, Use Checkout: ${chalk.yellow(useCheckout)}, Is Custom: ${chalk.yellow(
        isCustom
      )}`
    );

    // -------------------- ERROR CHECKING --------------------

    // 1. Check for normal errors (eg. options, different recurring intervals)
    await checkAddProductErrors({
      attachParams,
      useCheckout,
    });

    // 2. Check for existing product and fetch
    const { curCusProduct, done } = await handleExistingProduct({
      req,
      res,
      attachParams,
      useCheckout,
      invoiceOnly,
    });

    await handlePublicAttachErrors({
      curCusProduct,
      isPublic: req.isPublic,
    });

    if (done) return;

    // -------------------- ATTACH PRODUCT --------------------

    // SCENARIO 1: Free product, no existing product
    const curProductFree = isFreeProduct(
      curCusProduct?.customer_prices.map((cp: any) => cp.price) || [] // if no current product...
    );

    const newProductFree = isFreeProduct(attachParams.prices);

    if (
      (!curCusProduct && newProductFree) ||
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
        curCusProduct,
      });
      return;
    }

    if (useCheckout) {
      console.log("SCENARIO 2: USING CHECKOUT");
      await handleCreateCheckout({
        sb,
        res,
        attachParams,
      });
      return;
    }

    // SCENARIO 4: Switching product

    if (!attachParams.product.is_add_on && curCusProduct) {
      console.log("SCENARIO 3: SWITCHING PRODUCT");
      await handleChangeProduct({
        req,
        res,
        attachParams,
        curCusProduct,
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
