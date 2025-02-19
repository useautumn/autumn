import { Router } from "express";
import { getFullCusProductData } from "../customers/products/cusProductUtils.js";
import {
  checkStripeConnections,
  handleExistingProduct,
} from "../api/customers/products/cusProductRouter.js";
import { checkAddProductErrors } from "../api/customers/products/cusProductRouter.js";
import chalk from "chalk";
import { isFreeProduct } from "../products/productUtils.js";
import { handleAddFreeProduct } from "../customers/add-product/handleAddFreeProduct.js";
import { handleCreateCheckout } from "../customers/add-product/handleCreateCheckout.js";
import { handleRequestError } from "@/utils/errorUtils.js";

export const publicAttachRouter = Router();

publicAttachRouter.post("", async (req: any, res) => {
  const { customer_id, product_id, force_checkout } = req.body;
  const { env, org } = req;

  const sb = req.sb;

  const useCheckout = true;
  console.log("--------------------------------");
  console.log(`PUBLIC ATTACH PRODUCT REQUEST (from ${org.slug})`);

  try {
    // 1. Get full customer product data
    const attachParams = await getFullCusProductData({
      sb,
      customerId: customer_id,
      productId: product_id,
      orgId: org.id,
      env,
      customerData: {} as any,
      pricesInput: [],
      entsInput: [],
      optionsListInput: [],
      freeTrialInput: null,
      isCustom: false,
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
      console.log("PUBLIC SCENARIO 1: ADDING FREE PRODUCT");
      await handleAddFreeProduct({
        req,
        res,
        attachParams,
      });
      return;
    }

    // SCENARIO 2: Checkout
    console.log("PUBLIC SCENARIO 2: CREATING CHECKOUT");
    await handleCreateCheckout({
      sb,
      res,
      attachParams,
    });
    return;
  } catch (error: any) {
    handleRequestError({ req, res, error, action: "public attach product" });
  }
});
