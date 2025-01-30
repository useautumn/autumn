import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { Router } from "express";
import { CreateProductSchema, ProcessorType, Product } from "@autumn/shared";

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

import { getBillingType } from "@/internal/prices/priceUtils.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { handleNewFreeTrial } from "@/internal/products/free-trials/freeTrialUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { handleNewEntitlements } from "@/internal/products/entitlements/entitlementUtils.js";
import { handleNewPrices } from "@/internal/prices/priceInitUtils.js";

export const productApiRouter = Router();

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
    if (org.stripe_connected) {
      const stripeProduct = await createStripeProduct(org, req.env, newProduct);
      newProduct.processor = {
        id: stripeProduct.id,
        type: ProcessorType.Stripe,
      };
    }

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
    const cusProducts = await CusProductService.getByProductId(sb, productId);
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
    if (error instanceof RecaseError) {
      res.status(error.statusCode).send({
        message: error.message,
        code: error.code,
      });
      return;
    }

    console.error("Failed to delete product", error);
    res.status(500).send(error);
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

    // 2. If customer is on this product, don't allow changes
    const cusProducts = await CusProductService.getByProductId(sb, productId);
    if (cusProducts.length > 0) {
      throw new RecaseError({
        message: "Cannot update product with customers",
        code: ErrCode.ProductHasCustomers,
        statusCode: 400,
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
    });

    await handleNewPrices({
      sb,
      newPrices: prices,
      curPrices: fullProduct.prices,
      orgId,
      internalProductId: fullProduct.internal_id,
      isCustom: false,
    });

    res.status(200).send({ message: "Product updated" });
    return;

    // // 3. Validate prices and entitlements
    // const { newPrices, newEntitlements } = validatePricesAndEnts({
    //   prices,
    //   entitlements,
    //   orgId,
    //   internalProductId: fullProduct.internal_id,
    //   curPrices: fullProduct.prices,
    //   curEnts: fullProduct.entitlements,
    // });

    // // 4. Upsert prices and entitlements
    // await PriceService.upsert({ sb, data: newPrices });
    // await EntitlementService.upsert({ sb, data: newEntitlements });

    // // 5. Delete old prices and entitlements
    // await PriceService.deleteIfNotIn({
    //   sb,
    //   internalProductId: fullProduct.internal_id,
    //   priceIds: newPrices.map((p) => p.id!),
    // });

    // await EntitlementService.deleteIfNotIn({
    //   sb,
    //   internalProductId: fullProduct.internal_id,
    //   entitlementIds: newEntitlements.map((e) => e.id!),
    // });

    // res.status(200).send({ message: "Product updated" });
  } catch (error) {
    handleRequestError({ error, res, action: "Update product" });
  }
});
