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
import { AttachParams } from "../customers/products/AttachParams.js";

export const publicAttachRouter = Router();

export const handlePublicAttach = async (req: any, res: any) => {
  {
    const { customer_id, product_id, success_url, options } = req.body;
    const orgId = req.minOrg.id;
    const env = req.env;

    const sb = req.sb;

    const useCheckout = true;
    const optionsListInput = options || [];
    console.log("--------------------------------");
    console.log(`PUBLIC ATTACH PRODUCT REQUEST (from ${req.minOrg.slug})`);

    try {
      // 1. Get full customer product data
      const attachParams: AttachParams = await getFullCusProductData({
        sb,
        customerId: customer_id,
        productId: product_id,
        orgId: orgId,
        env,
        customerData: {} as any,
        pricesInput: [],
        entsInput: [],
        optionsListInput: optionsListInput,
        freeTrialInput: null,
        isCustom: false,
      });
      attachParams.successUrl = success_url;

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
      const { curCusProduct, done } = await handleExistingProduct({
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
        curCusProduct?.customer_prices.map((cp: any) => cp.price) || [] // if no current product...
      );
      const newProductFree = isFreeProduct(attachParams.prices);

      console.log("Current product free?", curProductFree);
      console.log("New product free?", newProductFree);

      if (
        (!curCusProduct && newProductFree) ||
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
  }
};

publicAttachRouter.post("", async (req: any, res) =>
  handlePublicAttach(req, res)
);
