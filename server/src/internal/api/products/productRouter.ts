import { ProductService } from "@/internal/products/ProductService.js";

import { Router } from "express";

import { handleRequestError } from "@/utils/errorUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import {
  checkStripeProductExists,
  isProductUpgrade,
} from "@/internal/products/productUtils.js";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import { createStripeCli } from "@/external/stripe/utils.js";

import { handleUpdateProductV2 } from "./handleUpdateProduct.js";
import { handleDeleteProduct } from "./handleDeleteProduct.js";
import { handleGetProduct } from "./handleGetProduct.js";
import { handleCopyProduct } from "./handlers/handleCopyProduct.js";

import { handleCreateProduct } from "./handlers/handleCreateProduct.js";
import { getProductResponse } from "@/internal/products/productV2Utils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

export const productApiRouter = Router();

productApiRouter.get("", async (req: any, res) => {
  try {
    const [org, features, products] = await Promise.all([
      OrgService.getFromReq(req),
      FeatureService.getFeatures({
        sb: req.sb,
        orgId: req.orgId,
        env: req.env,
      }),
      ProductService.getFullProducts({
        sb: req.sb,
        orgId: req.orgId,
        env: req.env,
      }),
    ]);

    let prods = products.map((p) =>
      getProductResponse({ product: p, features })
    );

    if (req.query.v1_schema === "true") {
      res.status(200).json({
        list: products,
      });
      return;
    }

    res.status(200).json({
      list: prods,
    });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Get products" });
  }
});

productApiRouter.post("", handleCreateProduct);

productApiRouter.get("/:productId", handleGetProduct);

productApiRouter.post("/:productId", handleUpdateProductV2);

productApiRouter.delete("/:productId", handleDeleteProduct);

productApiRouter.post("/:productId/copy", handleCopyProduct);

productApiRouter.post("/all/init_stripe", async (req: any, res) => {
  try {
    const { sb, orgId, env, logtail: logger } = req;

    const [fullProducts, org] = await Promise.all([
      ProductService.getFullProducts({
        sb,
        orgId,
        env,
      }),
      OrgService.getFromReq(req),
    ]);

    const stripeCli = createStripeCli({
      org,
      env,
    });

    const batchProductInit: Promise<any>[] = [];
    const productBatchSize = 5;
    for (let i = 0; i < fullProducts.length; i += productBatchSize) {
      const batch = fullProducts.slice(i, i + productBatchSize);
      const batchPromises = batch.map((product) =>
        checkStripeProductExists({
          sb,
          org,
          env,
          product,
          logger,
        })
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
            sb,
            org,
            stripeCli: stripeCli,
            price,
            entitlements,
            product: fullProducts.find(
              (p) => p.internal_id == price.internal_product_id
            )!,
            logger,
          })
        );
      }

      await Promise.all(batchPriceUpdate);
    }
    res.status(200).json({ message: "Stripe products initialized" });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Init stripe products" });
  }
});
