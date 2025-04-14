import { ProductService } from "@/internal/products/ProductService.js";

import { Router } from "express";
import {
  AppEnv,
  CreateFeatureSchema,
  CreateProductSchema,
} from "@autumn/shared";

import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { initNewFeature } from "../features/featureApiRouter.js";
import {
  checkStripeProductExists,
  constructProduct,
  copyProduct,
} from "@/internal/products/productUtils.js";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import { createStripeCli } from "@/external/stripe/utils.js";

import {
  handleUpdateProduct,
  handleUpdateProductV2,
} from "./handleUpdateProduct.js";
import { handleDeleteProduct } from "./handleDeleteProduct.js";
import { handleGetProduct } from "./handleGetProduct.js";
import { handleCopyProduct } from "./handlers/handleCopyProduct.js";

export const productApiRouter = Router();

productApiRouter.get("", async (req: any, res) => {
  const products = await ProductService.getFullProducts({
    sb: req.sb,
    orgId: req.orgId,
    env: req.env,
  });
  res.status(200).json(products);
});

productApiRouter.post("", async (req: any, res) => {
  try {
    const productData = CreateProductSchema.parse(req.body);
    let sb = req.sb;

    const org = await OrgService.getFullOrg({
      sb,
      orgId: req.orgId,
    });

    // 1. Check ir product already exists
    const existingProduct = await ProductService.getProductStrict({
      sb,
      productId: productData.id,
      orgId: org.id,
      env: req.env,
    });

    if (existingProduct) {
      throw new RecaseError({
        message: `Product ${productData.id} already exists`,
        code: ErrCode.ProductAlreadyExists,
        statusCode: 400,
      });
    }

    let newProduct = constructProduct({
      productData: CreateProductSchema.parse(productData),
      orgId: org.id,
      env: req.env,
      processor: null,
    });

    await ProductService.create({ sb, product: newProduct });

    res.status(200).json({ product_id: newProduct.id });

    return;
  } catch (error) {
    console.log("Failed to create product: ", error);

    if (error instanceof RecaseError) {
      res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
      return;
    }

    res.status(500).json(error);
    return;
  }
});

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
