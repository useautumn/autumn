import { ProductService } from "@/internal/products/ProductService.js";

import { Router } from "express";

import { handleRequestError } from "@/utils/errorUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import { checkStripeProductExists } from "@/internal/products/productUtils.js";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import { createStripeCli } from "@/external/stripe/utils.js";

import { handleUpdateProductV2 } from "./handlers/handleUpdateProduct/handleUpdateProduct.js";
import { handleDeleteProduct } from "./handlers/handleDeleteProduct.js";
import { handleGetProduct } from "./handlers/handleGetProduct.js";
import { handleCopyProduct } from "./handlers/handleCopyProduct.js";
import { handleCreateProduct } from "./handlers/handleCreateProduct.js";
import { handleListProducts } from "./handlers/handleListProducts.js";

export const productRouter: Router = Router();

productRouter.get("", handleListProducts);

productRouter.post("", handleCreateProduct);

productRouter.get("/:productId", handleGetProduct);

productRouter.post("/:productId", handleUpdateProductV2);

productRouter.delete("/:productId", handleDeleteProduct);

productRouter.post("/:productId/copy", handleCopyProduct);

productRouter.post("/all/init_stripe", async (req: any, res) => {
  try {
    const { orgId, env, logtail: logger, db } = req;

    const [fullProducts, org] = await Promise.all([
      ProductService.listFull({
        db,
        orgId,
        env,
      }),
      OrgService.getFromReq(req),
    ]);

    console.log(
      "fullProducts",
      fullProducts.map((p) => p.id),
    );

    const stripeCli = createStripeCli({
      org,
      env,
    });

    const productBatchSize = 5;
    for (let i = 0; i < fullProducts.length; i += productBatchSize) {
      const batch = fullProducts.slice(i, i + productBatchSize);
      const batchPromises = batch.map((product) =>
        checkStripeProductExists({
          db,
          org,
          env,
          product,
          logger,
        }),
      );
      await Promise.all(batchPromises);
    }

    const entitlements = fullProducts.flatMap((p) => p.entitlements);
    const prices = fullProducts.flatMap((p) => p.prices);

    const batchSize = 3;
    for (let i = 0; i < prices.length; i += batchSize) {
      const batch = prices.slice(i, i + batchSize);
      const batchPriceUpdate = [];
      for (const price of batch) {
        batchPriceUpdate.push(
          createStripePriceIFNotExist({
            db,
            org,
            stripeCli: stripeCli,
            price,
            entitlements,
            product: fullProducts.find(
              (p) => p.internal_id == price.internal_product_id,
            )!,
            logger,
          }),
        );
      }

      await Promise.all(batchPriceUpdate);
    }
    res.status(200).json({ message: "Stripe products initialized" });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Init stripe products" });
  }
});
