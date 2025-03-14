import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { Router } from "express";
import {
  AppEnv,
  CreateFeatureSchema,
  CreateProductSchema,
  ProcessorType,
  Product,
} from "@autumn/shared";

import RecaseError, {
  formatZodError,
  handleRequestError,
} from "@/utils/errorUtils.js";

import { ErrCode } from "@/errors/errCodes.js";

import { OrgService } from "@/internal/orgs/OrgService.js";
import {
  createStripeProduct,
  deleteStripeProduct,
} from "@/external/stripe/stripeProductUtils.js";

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
    const org = await OrgService.getFullOrg({
      sb,
      orgId,
    });

    const product = await ProductService.getProductStrict({
      sb,
      productId,
      orgId,
      env,
    });

    if (!product) {
      throw new RecaseError({
        message: `Product ${productId} not found`,
        code: ErrCode.ProductNotFound,
        statusCode: 404,
      });
    }

    // Delete stripe product
    try {
      await deleteStripeProduct(org, env, product);
    } catch (error: any) {
      console.log(
        "Failed to delete stripe product (moving on)",
        error?.message
      );
    }

    // Check if there are any customers with this product
    const cusProducts = await CusProductService.getByProductId(
      sb,
      product.internal_id
    );
    if (cusProducts.length > 0) {
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

productApiRouter.post("/:productId", async (req: any, res) => {
  const { productId } = req.params;
  const sb = req.sb;
  const orgId = req.orgId;
  const env = req.env;

  const { prices, entitlements, free_trial } = req.body;

  const features = await FeatureService.getFromReq(req);

  const org = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  try {
    // 1. Get full product
    const fullProduct = await ProductService.getFullProductStrict({
      sb,
      productId,
      orgId,
      env,
    });

    if (!fullProduct) {
      throw new RecaseError({
        message: "Product not found",
        code: ErrCode.ProductNotFound,
        statusCode: 404,
      });
    }

    console.log("free_trial", free_trial);
    await handleNewFreeTrial({
      sb,
      curFreeTrial: fullProduct.free_trial,
      newFreeTrial: free_trial,
      internalProductId: fullProduct.internal_id,
      isCustom: false,
    });

    // 1. Handle changing of entitlements
    await handleNewEntitlements({
      sb,
      newEnts: entitlements,
      curEnts: fullProduct.entitlements,
      features,
      orgId,
      internalProductId: fullProduct.internal_id,
      isCustom: false,
      prices,
    });

    await handleNewPrices({
      sb,
      newPrices: prices,
      curPrices: fullProduct.prices,
      entitlements,
      internalProductId: fullProduct.internal_id,
      isCustom: false,
      features,
      product: fullProduct,
      env,
      org,
    });

    res.status(200).send({ message: "Product updated" });
    return;
  } catch (error) {
    handleRequestError({ req, error, res, action: "Update product" });
  }
});

productApiRouter.post("/:productId/copy", async (req: any, res) => {
  const { productId } = req.params;
  const sb = req.sb;
  const orgId = req.orgId;
  const env = req.env;

  try {
    if (env == AppEnv.Live) {
      throw new RecaseError({
        message: "Can only copy product from sandbox to live",
        code: ErrCode.InvalidRequest,
        statusCode: 400,
      });
    }

    // 1. Check if product exists in live already...
    const existingLiveProd = await ProductService.getProductStrict({
      sb,
      productId,
      orgId,
      env: AppEnv.Live,
    });

    if (existingLiveProd) {
      throw new RecaseError({
        message: "Product already exists in live... can't copy again",
        code: ErrCode.ProductAlreadyExists,
        statusCode: 400,
      });
    }

    // 1. Get sandbox product
    const sandboxProduct = await ProductService.getFullProductStrict({
      sb,
      productId,
      orgId,
      env,
    });

    let sandboxFeatures = await FeatureService.getFeatures({
      sb,
      orgId,
      env,
    });

    let liveFeatures = await FeatureService.getFeatures({
      sb,
      orgId,
      env: AppEnv.Live,
    });

    // 1. Copy features
    for (const sandboxFeature of sandboxFeatures) {
      const liveFeature = liveFeatures.find((f) => f.id == sandboxFeature.id);

      if (liveFeature && sandboxFeature.type !== liveFeature.type) {
        throw new RecaseError({
          message: `Feature ${sandboxFeature.name} exists in live, but has a different config. Please match them then try again.`,
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      if (!liveFeature) {
        let res = await FeatureService.insert({
          sb,
          data: initNewFeature({
            data: CreateFeatureSchema.parse(sandboxFeature),
            orgId,
            env: AppEnv.Live,
          }),
        });

        liveFeatures.push(res![0]);
      }
    }

    // 2. Copy product
    await copyProduct({
      sb,
      product: sandboxProduct,
      toOrgId: orgId,
      toEnv: AppEnv.Live,
      features: liveFeatures,
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

    const batchProductInit = [];
    for (const product of fullProducts) {
      batchProductInit.push(
        checkStripeProductExists({
          sb,
          org,
          env,
          product,
          logger,
        })
      );
    }

    await Promise.all(batchProductInit);

    const entitlements = fullProducts.flatMap((p) => p.entitlements);
    const prices = fullProducts.flatMap((p) => p.prices);

    const batchSize = 5;
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
      res.status(200).send({ message: "Stripe products initialized" });
    }
  } catch (error) {
    handleRequestError({ req, error, res, action: "Init stripe products" });
  }
});
