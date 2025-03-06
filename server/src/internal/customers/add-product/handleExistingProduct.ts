import RecaseError from "@/utils/errorUtils.js";

import {
  CusProductStatus,
  Customer,
  Entitlement,
  EntitlementWithFeature,
  FullCusProduct,
  Price,
  Product,
} from "@autumn/shared";
import { ErrCode } from "@/errors/errCodes.js";

import {
  getPricesForProduct,
  isFreeProduct,
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

export const getExistingCusProducts = async ({
  sb,
  product,
  cusProducts,
}: {
  sb: SupabaseClient;
  product: Product;
  cusProducts: FullCusProduct[];
}) => {
  // if (!cusProducts) {
  // cusProducts = await CusService.getFullCusProducts({
  //   sb,
  //   internalCustomerId: customer.internal_id,
  //   withProduct: true,
  //   withPrices: true,
  //   inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
  // });
  // }

  let curMainProduct = cusProducts!.find(
    (cp: any) =>
      cp.product.group === product.group &&
      !cp.product.is_add_on &&
      cp.status === CusProductStatus.Active
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
  sb,

  attachParams,
}: {
  sb: SupabaseClient;

  attachParams: AttachParams;
}) => {
  let { customer, products } = attachParams;

  for (const product of products) {
    let { curMainProduct, curSameProduct, curScheduledProduct }: any =
      await getExistingCusProducts({
        sb,
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

  console.log("Multiple products: no current product found");

  return { curCusProduct: null, done: false };
};

export const handleExistingProduct = async ({
  req,
  res,
  attachParams,
  useCheckout = false,
  invoiceOnly = false,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  useCheckout?: boolean;
  invoiceOnly?: boolean;
}): Promise<{ curCusProduct: FullCusProduct | null; done: boolean }> => {
  const { sb } = req;
  const { customer, products } = attachParams;

  const cusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId: customer.internal_id,
    withProduct: true,
    withPrices: true,
    inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
  });

  attachParams.cusProducts = cusProducts;

  if (products.length > 1) {
    return await handleExistingMultipleProducts({
      sb,
      attachParams,
    });
  }

  const product = products[0];

  let { curMainProduct, curSameProduct, curScheduledProduct }: any =
    await getExistingCusProducts({
      sb,
      product,
      cusProducts,
    });

  console.log(
    `Single product: current main customer_product: ${chalk.yellow(
      curMainProduct?.product.name || "None"
    )}`
  );

  console.log(
    `Single product: current same product exists: ${chalk.yellow(
      curSameProduct ? "Yes" : "No"
    )}`
  );

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
      res,
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
    let mainProductWithPrices = {
      ...curMainProduct.product,
      prices: curMainProduct.customer_prices.map(
        (cp: any) => cp.price
      ) as Price[],
      entitlements: curMainProduct.customer_entitlements.map(
        (ce: any) => ce.entitlement
      ) as EntitlementWithFeature[],
    };

    let downgradeToFree =
      !isProductUpgrade(mainProductWithPrices, product) &&
      isFreeProduct(attachParams.prices);

    let upgradeFromFree =
      isProductUpgrade(mainProductWithPrices, product) &&
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

  // If main product is free, or attached product is an add-on, treat as if adding new product
  if (
    (curMainProduct &&
      isFreeProduct(
        curMainProduct.customer_prices.map((cp: any) => cp.price)
      )) ||
    attachParams.products[0].is_add_on
  ) {
    curMainProduct = null;
  }

  if (curMainProduct && invoiceOnly) {
    // return { curCusProduct: curMainProduct, done: true };
    throw new RecaseError({
      message: `Please contact hey@useautumn.com to enable upgrading / downgrading through invoice`,
      code: ErrCode.CustomerAlreadyHasProduct,
      statusCode: 400,
    });
  }

  return { curCusProduct: curMainProduct || null, done: false };
};
