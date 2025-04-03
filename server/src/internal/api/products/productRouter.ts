import { ProductService } from "@/internal/products/ProductService.js";
import { generateId, notNullish } from "@/utils/genUtils.js";
import { Router } from "express";
import {
  AppEnv,
  CreateFeatureSchema,
  CreateProductSchema,
  Organization,
  Product,
  UpdateProduct,
  UpdateProductSchema,
} from "@autumn/shared";

import RecaseError, {
  formatZodError,
  handleRequestError,
} from "@/utils/errorUtils.js";

import { ErrCode } from "@/errors/errCodes.js";

import { OrgService } from "@/internal/orgs/OrgService.js";
import { deleteStripeProduct } from "@/external/stripe/stripeProductUtils.js";

import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { handleNewFreeTrial } from "@/internal/products/free-trials/freeTrialUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { handleNewEntitlements } from "@/internal/products/entitlements/entitlementUtils.js";
import { handleNewPrices } from "@/internal/prices/priceInitUtils.js";
import { initNewFeature } from "../features/featureApiRouter.js";
import {
  checkStripeProductExists,
  copyProduct,
} from "@/internal/products/productUtils.js";
import { createStripePriceIFNotExist } from "@/external/stripe/stripePriceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { handleUpdateProduct } from "./handleUpdateProduct.js";

export const productApiRouter = Router();

productApiRouter.get("", async (req: any, res) => {
  const products = await ProductService.getFullProducts({
    sb: req.sb,
    orgId: req.orgId,
    env: req.env,
  });
  res.status(200).send(products);
});

productApiRouter.post("", async (req: any, res) => {
  try {
    const { product } = req.body;
    let sb = req.sb;

    const org = await OrgService.getFullOrg({
      sb,
      orgId: req.orgId,
    });

    let newProduct: Product;

    // 1. Check ir product already exists
    const existingProduct = await ProductService.getProductStrict({
      sb,
      productId: product.id,
      orgId: org.id,
      env: req.env,
    });

    if (existingProduct) {
      throw new RecaseError({
        message: `Product ${product.id} already exists`,
        code: ErrCode.ProductAlreadyExists,
        statusCode: 400,
      });
    }

    try {
      const productSchema = CreateProductSchema.parse(product);

      newProduct = {
        ...productSchema,
        internal_id: generateId("prod"),
        id: product.id,
        org_id: org.id,
        created_at: Date.now(),
        env: req.env,
      };
    } catch (error: any) {
      console.log("Error creating product: ", error);
      throw new RecaseError({
        message: "Invalid product. " + formatZodError(error),
        code: ErrCode.InvalidProduct,
        statusCode: 400,
        data: formatZodError(error),
      });
    }

    // 1. Create Stripe product if needed
    // if (org.stripe_connected) {
    //   const stripeProduct = await createStripeProduct(org, req.env, newProduct);
    //   newProduct.processor = {
    //     id: stripeProduct.id,
    //     type: ProcessorType.Stripe,
    //   };
    // }

    await ProductService.create({ sb, product: newProduct });

    res.status(200).send({ product_id: newProduct.id });

    return;
  } catch (error) {
    console.log("Failed to create product: ", error);

    if (error instanceof RecaseError) {
      res.status(error.statusCode).send({
        message: error.message,
        code: error.code,
      });
      return;
    }

    res.status(500).send(error);
    return;
  }
});

productApiRouter.delete("/:productId", async (req: any, res) => {
  const { productId } = req.params;
  const sb = req.sb;
  const orgId = req.orgId;
  const env = req.env;

  try {
    const [org, product] = await Promise.all([
      OrgService.getFullOrg({
        sb,
        orgId,
      }),
      ProductService.getProductStrict({
        sb,
        productId,
        orgId,
        env,
      }),
    ]);

    let cusProducts = await CusProductService.getByProductId(
      sb,
      product.internal_id
    )

    if (!product) {
      throw new RecaseError({
        message: `Product ${productId} not found`,
        code: ErrCode.ProductNotFound,
        statusCode: 404,
      });
    }

    let cusProductExists = cusProducts.length > 0;


    if (cusProductExists) {
      throw new RecaseError({
        message: "Cannot delete product with customers",
        code: ErrCode.ProductHasCustomers,
        statusCode: 400,
      });
    }

    // 2. Delete prices, entitlements, and product
    await ProductService.deleteProduct({
      sb,
      productId,
      orgId,
      env,
    });

    res.status(200).send({ message: "Product deleted" });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Delete product" });
  }

  return;
});

productApiRouter.post("/:productId", handleUpdateProduct);

productApiRouter.post("/:productId/copy", async (req: any, res) => {
  const { productId: fromProductId } = req.params;
  const sb = req.sb;
  const orgId = req.orgId;
  const fromEnv = req.env;
  const { env: toEnv, id: toId, name: toName } = req.body;

  if (!toEnv || !toId || !toName) {
    throw new RecaseError({
      message: "env, id, and name are required",
      code: ErrCode.InvalidRequest,
      statusCode: 400,
    });
  }

  if (fromEnv == toEnv && fromProductId == toId) {
    throw new RecaseError({
      message: "Product ID already exists",
      code: ErrCode.InvalidRequest,
      statusCode: 400,
    });
  }

  try {
    // 1. Check if product exists in live already...
    const toProduct = await ProductService.getProductStrict({
      sb,
      productId: toId,
      orgId,
      env: toEnv,
    });

    if (toProduct) {
      throw new RecaseError({
        message: "Product already exists in live... can't copy again",
        code: ErrCode.ProductAlreadyExists,
        statusCode: 400,
      });
    }

    // 1. Get sandbox product
    const [fromFullProduct, fromFeatures, toFeatures] = await Promise.all([
      ProductService.getFullProductStrict({
        sb,
        productId: fromProductId,
        orgId,
        env: fromEnv,
      }),
      FeatureService.getFeatures({
        sb,
        orgId,
        env: fromEnv,
      }),
      FeatureService.getFeatures({
        sb,
        orgId,
        env: toEnv,
      }),
    ]);

    if (fromEnv != toEnv) {
      for (const fromFeature of fromFeatures) {
        const toFeature = toFeatures.find((f) => f.id == fromFeature.id);

        if (toFeature && fromFeature.type !== toFeature.type) {
          throw new RecaseError({
            message: `Feature ${fromFeature.name} exists in ${toEnv}, but has a different config. Please match them then try again.`,
            code: ErrCode.InvalidRequest,
            statusCode: 400,
          });
        }

        if (!toFeature) {
          let res = await FeatureService.insert({
            sb,
            data: initNewFeature({
              data: CreateFeatureSchema.parse(fromFeature),
              orgId,
              env: toEnv,
            }),
          });

          toFeatures.push(res![0]);
        }
      }
    }

    // // 2. Copy product
    await copyProduct({
      sb,
      product: fromFullProduct,
      toOrgId: orgId,
      toId,
      toName,
      toEnv: toEnv,
      features: toFeatures,
    });

    // 2. Get product from sandbox
    res.status(200).send({ message: "Product copied" });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Copy product" });
  }
});

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
    res.status(200).send({ message: "Stripe products initialized" });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Init stripe products" });
  }
});
