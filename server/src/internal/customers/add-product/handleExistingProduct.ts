import RecaseError from "@/utils/errorUtils.js";

import {
  BillingInterval,
  CusProductStatus,
  EntitlementWithFeature,
  FullCusProduct,
  Price,
  Product,
} from "@autumn/shared";
import { ErrCode } from "@/errors/errCodes.js";

import {
  getPricesForProduct,
  isFreeProduct,
  isOneOff,
  isProductUpgrade,
} from "@/internal/products/productUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import chalk from "chalk";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  handleSameAddOnProduct,
  handleSameMainProduct,
} from "@/internal/customers/add-product/handleSameProduct.js";
import { pricesOnlyOneOff } from "@/internal/prices/priceUtils.js";
import { getPricesForCusProduct } from "../change-product/scheduleUtils.js";

export const getExistingCusProducts = async ({
  product,
  cusProducts,
}: {
  product: Product;
  cusProducts: FullCusProduct[];
}) => {
  if (!cusProducts || cusProducts.length === 0) {
    return {
      curMainProduct: null,
      curSameProduct: null,
      curScheduledProduct: null,
    };
  }

  let curMainProduct = cusProducts.find(
    (cp: any) =>
      cp.product.group === product.group &&
      !cp.product.is_add_on &&
      cp.status === CusProductStatus.Active &&
      !isOneOff(cp.customer_prices.map((cp: any) => cp.price))
  );

  const curSameProduct = cusProducts!.find(
    (cp: any) => cp.product.internal_id === product.internal_id
  );

  const curScheduledProduct = cusProducts!.find(
    (cp: any) =>
      cp.status === CusProductStatus.Scheduled &&
      cp.product.group === product.group &&
      !cp.product.is_add_on
  );

  return { curMainProduct, curSameProduct, curScheduledProduct };
};

const handleExistingMultipleProducts = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  let { products } = attachParams;

  // If all one time products, return ok
  if (
    products.every((p) =>
      p.prices.every(
        (price) => price.config?.interval === BillingInterval.OneOff
      )
    )
  ) {
    return { curCusProduct: null, done: false };
  }

  for (const product of products) {
    let { curMainProduct, curSameProduct, curScheduledProduct }: any =
      await getExistingCusProducts({
        product,
        cusProducts: attachParams.cusProducts!,
      });

    // 2. If existing same product
    if (curSameProduct) {
      // 2a. If add-on product, only allow if prices are one-off
      let prices = getPricesForProduct(product, attachParams.prices);
      let allowed = product.is_add_on && pricesOnlyOneOff(prices);
      if (!allowed) {
        throw new RecaseError({
          message: `Product ${product.name} is already attached, can't attach again`,
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }
    }

    // 3. If existing scheduled product, can't remove...
    if (curScheduledProduct) {
      throw new RecaseError({
        message: `Can't attach multiple products at once when scheduled product exists...`,
        code: ErrCode.InvalidRequest,
        statusCode: 400,
      });
    }

    // Set curMainProduct to null if it's free
    if (
      curMainProduct &&
      isFreeProduct(curMainProduct.customer_prices.map((cp: any) => cp.price))
    ) {
      curMainProduct = null;
    }

    // 3. If existing main product, can't upgrade / downgrade
    if (curMainProduct && !product.is_add_on) {
      throw new RecaseError({
        message: `Upgrade / downgrade to ${product.name} not allowed with multiple products`,
        code: ErrCode.InvalidRequest,
        statusCode: 400,
      });
    }
  }

  return { curCusProduct: null, done: false };
};

export const handleExistingProduct = async ({
  req,
  res,
  attachParams,
  useCheckout = false,
  invoiceOnly = false,
  isCustom = false,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  useCheckout?: boolean;
  invoiceOnly?: boolean;
  isCustom?: boolean;
}): Promise<{ curCusProduct: FullCusProduct | null; done: boolean }> => {
  const { sb, logtail: logger } = req;
  const { customer, products, cusProducts } = attachParams;

  if (products.length > 1) {
    return await handleExistingMultipleProducts({
      attachParams,
    });
  }

  const product = products[0];

  let { curMainProduct, curSameProduct, curScheduledProduct }: any =
    await getExistingCusProducts({
      product,
      cusProducts: cusProducts || [],
    });

  if (isOneOff(product.prices)) {
    return { curCusProduct: null, done: false };
  }

  logger.info(
    `Checking existing product | curMain: ${chalk.yellow(
      curMainProduct?.product.name || "None"
    )} | curSame: ${chalk.yellow(
      curSameProduct?.product.name || "None"
    )} | curScheduled: ${chalk.yellow(
      curScheduledProduct?.product.name || "None"
    )}`
  );

  attachParams.curCusProduct = curMainProduct;
  attachParams.curScheduledProduct = curScheduledProduct;

  // Case 2: Current product is scheduled
  if (curScheduledProduct?.product.internal_id === product.internal_id) {
    throw new RecaseError({
      message: `${product.name} is already scheduled, can't attach again`,
      code: ErrCode.CustomerAlreadyHasProduct,
      statusCode: 400,
    });
  }

  // Case 3: Main product is same -- remove scheduled and update quantity
  if (curMainProduct?.product.internal_id === product.internal_id) {
    return await handleSameMainProduct({
      sb,
      curMainProduct,
      curScheduledProduct,
      attachParams,
      req,
      res,
      isCustom,
    });
  }

  // Case 4: Add-on product is same -- remove scheduled and update quantity

  if (curSameProduct && product.is_add_on) {
    return await handleSameAddOnProduct({
      sb,
      curSameProduct,
      curMainProduct: curMainProduct || null,
      attachParams,
      res,
    });
  }

  // Case 5: Main product exists, different from new product
  if (curMainProduct && useCheckout) {
    let mainProductPrices = getPricesForCusProduct({
      cusProduct: curMainProduct,
    });

    let downgradeToFree =
      !isProductUpgrade({
        prices1: mainProductPrices,
        prices2: attachParams.prices,
      }) && isFreeProduct(attachParams.prices);

    let upgradeFromFree =
      isProductUpgrade({
        prices1: mainProductPrices,
        prices2: attachParams.prices,
      }) &&
      isFreeProduct(
        curMainProduct?.customer_prices.map((cp: any) => cp.price) || []
      );

    let isAddOn = product.is_add_on;

    if (!downgradeToFree && !upgradeFromFree && !isAddOn) {
      throw new RecaseError({
        message: `Either payment method not found, or force_checkout is true: unable to perform upgrade / downgrade`,
        code: ErrCode.InvalidRequest,
        statusCode: 400,
      });
    }
  }

  // If main product is free, or one time product, or  add-on, treat as if adding new product

  if (
    (curMainProduct &&
      isFreeProduct(
        curMainProduct.customer_prices.map((cp: any) => cp.price)
      )) ||
    attachParams.products[0].is_add_on
  ) {
    curMainProduct = null;
    attachParams.curCusProduct = undefined;
  }

  // if (curMainProduct && invoiceOnly) {
  //   // return { curCusProduct: curMainProduct, done: true };
  //   throw new RecaseError({
  //     message: `Please contact hey@useautumn.com to enable upgrading / downgrading through invoice`,
  //     code: ErrCode.CustomerAlreadyHasProduct,
  //     statusCode: 400,
  //   });
  // }

  return { curCusProduct: curMainProduct || null, done: false };
};
