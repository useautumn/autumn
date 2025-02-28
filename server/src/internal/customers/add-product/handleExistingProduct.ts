import RecaseError from "@/utils/errorUtils.js";

import {
  CusProductStatus,
  Customer,
  FullCusProduct,
  Product,
} from "@autumn/shared";
import { ErrCode } from "@/errors/errCodes.js";

import {
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

const getExistingCusProducts = async ({
  sb,
  product,
  customer,
}: {
  sb: SupabaseClient;
  product: Product;
  customer: Customer;
}) => {
  const cusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId: customer.internal_id,
    withProduct: true,
    withPrices: true,
    inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
    productGroup: product.group,
  });

  const curMainProduct = cusProducts.find(
    (cp: any) => cp.product.group === product.group && !cp.product.is_add_on
  );

  const curSameProduct = cusProducts.find(
    (cp: any) => cp.product.internal_id === product.internal_id
  );

  const curScheduledProduct = cusProducts.find(
    (cp: any) => cp.status === CusProductStatus.Scheduled
  );

  console.log(
    `Current main customer_product: ${chalk.yellow(
      curMainProduct?.product.name || "None"
    )}`
  );
  console.log(
    `Current same product exists: ${chalk.yellow(
      curSameProduct ? "Yes" : "No"
    )}`
  );

  return { curMainProduct, curSameProduct, curScheduledProduct };
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
}): Promise<{ curCusProduct: FullCusProduct | null; done: boolean }> => {
  const { sb } = req;
  const { customer, product } = attachParams;

  const { curMainProduct, curSameProduct, curScheduledProduct } =
    await getExistingCusProducts({
      sb,
      product,
      customer,
    });

  // Case 1: No base product, can't attach add-on
  if (!curMainProduct && product.is_add_on) {
    throw new RecaseError({
      message: `Customer has no base product, can't attach add-on`,
      code: ErrCode.CustomerHasNoBaseProduct,
      statusCode: 400,
    });
  }

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
      curMainProduct,
      attachParams,
      res,
    });
  }

  // Case 5: Main product exists, different from new product
  if (curMainProduct && useCheckout) {
    // If not downgrade to free, throw error
    let downgradeToFree =
      !isProductUpgrade(curMainProduct.product, product) &&
      isFreeProduct(attachParams.prices);

    let upgradeFromFree =
      isProductUpgrade(curMainProduct.product, product) &&
      isFreeProduct(
        curMainProduct?.customer_prices.map((cp: any) => cp.price) || []
      );

    let isAddOn = attachParams.product.is_add_on;

    if (!downgradeToFree && !upgradeFromFree && !isAddOn) {
      throw new RecaseError({
        message: `Either payment method not found, or force_checkout is true: unable to perform upgrade / downgrade`,
        code: ErrCode.InvalidRequest,
        statusCode: 400,
      });
    }
  }

  return { curCusProduct: curMainProduct, done: false };
};
