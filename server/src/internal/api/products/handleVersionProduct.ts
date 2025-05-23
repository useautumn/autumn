import { handleNewPrices } from "@/internal/prices/priceInitUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { handleNewEntitlements } from "@/internal/products/entitlements/entitlementUtils.js";
import { handleNewFreeTrial } from "@/internal/products/free-trials/freeTrialUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
  constructProduct,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import {
  AppEnv,
  CreateProductSchema,
  Entitlement,
  FreeTrial,
  Organization,
  Price,
  ProductItem,
} from "@autumn/shared";

import { FullProduct } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";

import { handleNewProductItems } from "@/internal/products/product-items/productItemInitUtils.js";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems.js";

export const handleVersionProduct = async ({
  req,
  res,
  sb,
  latestProduct,
  org,
  env,
  prices,
  entitlements,
  freeTrial,
}: {
  req: any;
  res: any;
  sb: SupabaseClient;
  latestProduct: FullProduct;
  org: Organization;
  env: AppEnv;
  prices: Price[];
  entitlements: Entitlement[];
  freeTrial: FreeTrial;
}) => {
  let curVersion = latestProduct.version;
  let newVersion = curVersion + 1;

  let features = await FeatureService.getFromReq({
    req,
    sb,
    orgId: org.id,
    env,
  });

  console.log(
    `Updating product ${latestProduct.id} version from ${curVersion} to ${newVersion}`,
  );

  const newProduct = constructProduct({
    productData: CreateProductSchema.parse({
      ...latestProduct,
      version: newVersion,
    }),
    orgId: org.id,
    env: latestProduct.env as AppEnv,
    processor: latestProduct.processor,
  });

  await ProductService.create({ sb, product: newProduct });

  // Create new prices, entitlements and free trials
  await handleNewEntitlements({
    sb,
    newEnts: entitlements,
    curEnts: latestProduct.entitlements,
    features: features,
    internalProductId: newProduct.internal_id,
    orgId: org.id,
    isCustom: false,
    prices,
    newVersion: true,
  });

  await Promise.all([
    handleNewPrices({
      sb,
      newPrices: prices,
      curPrices: latestProduct.prices,
      internalProductId: newProduct.internal_id,
      isCustom: false,
      org,
      env,
      entitlements,
      features,
      product: newProduct,
      newVersion: true,
    }),
    handleNewFreeTrial({
      sb,
      newFreeTrial: freeTrial,
      curFreeTrial: null,
      internalProductId: newProduct.internal_id,
      isCustom: false,
    }),
  ]);

  let newFullProduct = await ProductService.getFullProduct({
    sb,
    productId: newProduct.id,
    orgId: org.id,
    env,
    version: newVersion,
  });

  res.status(200).json(newFullProduct);
};

export const handleVersionProductV2 = async ({
  req,
  res,
  sb,
  latestProduct,
  org,
  env,
  items,
  freeTrial,
}: {
  req: any;
  res: any;
  sb: SupabaseClient;
  latestProduct: FullProduct;
  org: Organization;
  env: AppEnv;
  items: ProductItem[];
  freeTrial: FreeTrial;
}) => {
  let curVersion = latestProduct.version;
  let newVersion = curVersion + 1;

  let features = await FeatureService.getFromReq({
    req,
    sb,
    orgId: org.id,
    env,
  });

  console.log(
    `Updating product ${latestProduct.id} version from ${curVersion} to ${newVersion}`,
  );

  const newProduct = constructProduct({
    productData: CreateProductSchema.parse({
      ...latestProduct,
      version: newVersion,
    }),
    orgId: org.id,
    env: latestProduct.env as AppEnv,
    processor: latestProduct.processor,
  });

  console.log("New product:", newProduct);

  // Validate product items...
  validateProductItems({
    newItems: items,
    features,
    orgId: org.id,
    env,
  });

  await ProductService.create({ sb, product: newProduct });

  await handleNewProductItems({
    db: req.db,
    sb,
    curPrices: latestProduct.prices,
    curEnts: latestProduct.entitlements,
    newItems: items,
    features,
    product: newProduct,
    logger: console,
    isCustom: false,
    newVersion: true,
  });

  // Handle new free trial
  if (freeTrial) {
    await handleNewFreeTrial({
      sb,
      newFreeTrial: freeTrial,
      curFreeTrial: null,
      internalProductId: newProduct.internal_id,
      isCustom: false,
    });
  }

  res.status(200).send(newProduct);
};
