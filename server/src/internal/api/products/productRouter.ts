import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { Router } from "express";
import {
  CreateEntitlement,
  CreateEntitlementSchema,
  CreatePrice,
  CreatePriceSchema,
  CreateProduct,
  CreateProductSchema,
  Entitlement,
  EntitlementSchema,
  Organization,
  Price,
  PriceSchema,
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
import { getBillingType } from "@/internal/prices/priceUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { EntitlementService } from "@/internal/products/EntitlementService.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";

export const productApiRouter = Router();

const handleInsertFullProduct = async ({
  sb,
  product,
  prices,
  entitlements,
}: {
  sb: SupabaseClient;
  product: Product;
  prices: Price[];
  entitlements: Entitlement[];
}) => {
  await ProductService.create({ sb, product });
  await PriceService.insert({ sb, data: prices });
  await EntitlementService.insert({ sb, data: entitlements });
};

const validateCreateProduct = ({
  product,
  prices,
  entitlements,
  org,
  env,
}: {
  product: CreateProduct;
  prices: CreatePrice[];
  entitlements: CreateEntitlement[];
  org: Organization;
  env: string;
}) => {
  let newProduct: Product;
  try {
    const productSchema = CreateProductSchema.parse(product);
    newProduct = {
      ...productSchema,

      id: generateId("prod"),
      org_id: org.id,
      created_at: Date.now(),
      env,
    };
  } catch (error: any) {
    throw new RecaseError({
      message: "Invalid product. " + formatZodError(error),
      code: ErrCode.InvalidProduct,
      statusCode: 400,
      data: error,
    });
  }

  let newPrices: Price[] = [];
  for (const price of prices) {
    try {
      const priceSchema = CreatePriceSchema.parse(price);
      newPrices.push({
        ...priceSchema,
        id: generateId("pr"),
        org_id: org.id,
        created_at: Date.now(),
        billing_type: getBillingType(priceSchema.config!),
        product_id: newProduct.id,
        is_custom: false,
      });
    } catch (error: any) {
      throw new RecaseError({
        message: "Invalid price. " + formatZodError(error),
        code: ErrCode.InvalidPrice,
        statusCode: 400,
        data: error,
      });
    }
  }

  let newEntitlements: Entitlement[] = [];
  for (const entitlement of entitlements) {
    try {
      const entitlementSchema = CreateEntitlementSchema.parse(entitlement);
      newEntitlements.push({
        ...entitlementSchema,
        id: generateId("ent"),
        org_id: org.id,
        created_at: Date.now(),
        product_id: newProduct.id,
        is_custom: false,
      });
    } catch (error: any) {
      throw new RecaseError({
        message: "Invalid entitlement. " + formatZodError(error),
        code: ErrCode.InvalidEntitlement,
        statusCode: 400,
        data: error,
      });
    }
  }

  return { newProduct, newPrices, newEntitlements };
};

productApiRouter.post("", async (req: any, res) => {
  try {
    const { product, prices, entitlements } = req.body;
    let sb = req.sb;

    const org = await OrgService.getFullOrg({
      sb,
      orgId: req.org.id,
    });

    // const { newProduct, newPrices, newEntitlements } = validateCreateProduct({
    //   product,
    //   prices,
    //   entitlements,
    //   org,
    //   env: req.env,
    // });

    let newProduct: Product;
    try {
      const productSchema = CreateProductSchema.parse(product);
      newProduct = {
        ...productSchema,

        id: generateId("prod"),
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

    // await handleInsertFullProduct({
    //   sb,
    //   product: newProduct,
    //   prices: newPrices,
    //   entitlements: newEntitlements,
    // });

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
  const orgId = req.org.id;
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
    await ProductService.deleteProduct(sb, productId);

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

// Update a product

const validatePricesAndEnts = ({
  prices,
  entitlements,
  orgId,
  productId,
  curPrices,
  curEnts,
}: {
  prices: CreatePrice[];
  entitlements: CreateEntitlement[];
  orgId: string;
  productId: string;
  curPrices: Price[];
  curEnts: Entitlement[];
}) => {
  // TODO
  let newPrices: Price[] = [];
  const idToPrice: { [key: string]: Price } = {};
  for (const price of curPrices) {
    idToPrice[price.id!] = PriceSchema.parse(price);
  }

  const idToEnt: { [key: string]: Entitlement } = {};
  for (const ent of curEnts) {
    idToEnt[ent.id!] = EntitlementSchema.parse(ent);
  }

  // console.log("Prices: ", prices);
  // console.log("Ents: ", entitlements);

  for (const price of prices) {
    let newPrice: Price;

    try {
      newPrice = PriceSchema.parse(price);
    } catch (error: any) {
      throw new RecaseError({
        message: "Invalid price. " + formatZodError(error),
        code: ErrCode.InvalidPrice,
        statusCode: 400,
        data: error,
      });
    }

    if (idToPrice[newPrice.id!]) {
      // Update
      newPrices.push({
        ...idToPrice[newPrice.id!],
        name: newPrice.name,
        config: newPrice.config,
      });
    } else {
      // Create
      newPrices.push({
        // id: generateId("pr"),
        org_id: orgId,
        created_at: Date.now(),
        billing_type: getBillingType(newPrice.config!),
        product_id: productId,
        is_custom: false,
        ...newPrice,
      });
    }
  }

  let newEntitlements: Entitlement[] = [];
  for (const entitlement of entitlements) {
    let newEnt: Entitlement;

    try {
      newEnt = EntitlementSchema.parse(entitlement);
    } catch (error: any) {
      throw new RecaseError({
        message: "Invalid entitlement. " + formatZodError(error),
        code: ErrCode.InvalidEntitlement,
        statusCode: 400,
        data: error,
      });
    }

    if (idToEnt[newEnt.id!]) {
      let curEnt = idToEnt[newEnt.id!];

      if (curEnt.feature_id !== newEnt.feature_id) {
        throw new RecaseError({
          message: "Cannot change feature_id",
          code: ErrCode.InvalidEntitlement,
          statusCode: 400,
        });
      }

      // Update
      newEntitlements.push({
        ...idToEnt[newEnt.id!],

        allowance_type: newEnt.allowance_type,
        allowance: newEnt.allowance,
        interval: newEnt.interval,
      });
    } else {
      // Create
      newEntitlements.push({
        // id: generateId("ent"),
        org_id: orgId,
        created_at: Date.now(),
        product_id: productId,
        is_custom: false,

        ...newEnt,
      });
    }
  }

  return { newPrices, newEntitlements };
};

productApiRouter.post("/:productId", async (req: any, res) => {
  const { productId } = req.params;
  const sb = req.sb;
  const orgId = req.org.id;
  const env = req.env;

  const { prices, entitlements } = req.body;

  // Validate prices and entitlements
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

    // 3. Validate prices and entitlements
    const { newPrices, newEntitlements } = validatePricesAndEnts({
      prices,
      entitlements,
      orgId,
      productId,
      curPrices: fullProduct.prices,
      curEnts: fullProduct.entitlements,
    });

    // 4. Upsert prices and entitlements
    await PriceService.upsert({ sb, data: newPrices });
    await EntitlementService.upsert({ sb, data: newEntitlements });

    // 5. Delete old prices and entitlements
    await PriceService.deleteIfNotIn({
      sb,
      productId,
      priceIds: newPrices.map((p) => p.id!),
    });

    await EntitlementService.deleteIfNotIn({
      sb,
      productId,
      entitlementIds: newEntitlements.map((e) => e.id!),
    });

    res.status(200).send({ message: "Product updated" });
  } catch (error) {
    handleRequestError({ error, res, action: "Update product" });
  }
});
