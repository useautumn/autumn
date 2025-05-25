import { FeatureService } from "@/internal/features/FeatureService.js";
import { handleNewFreeTrial } from "@/internal/products/free-trials/freeTrialUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { constructProduct } from "@/internal/products/productUtils.js";
import {
  AppEnv,
  CreateProductSchema,
  FreeTrial,
  Organization,
  ProductItem,
} from "@autumn/shared";

import { FullProduct } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemInitUtils.js";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems.js";

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
  const { db } = req;

  let curVersion = latestProduct.version;
  let newVersion = curVersion + 1;

  let features = await FeatureService.getFromReq(req);

  console.log(
    `Updating product ${latestProduct.id} version from ${curVersion} to ${newVersion}`,
  );

  const newProduct = constructProduct({
    productData: CreateProductSchema.parse({
      ...latestProduct,
      ...req.body,
      version: newVersion,
    }),
    orgId: org.id,
    env: latestProduct.env as AppEnv,
    processor: latestProduct.processor,
  });

  // Validate product items...
  validateProductItems({
    newItems: items,
    features,
    orgId: org.id,
    env,
  });

  await ProductService.insert({ db, product: newProduct });

  await handleNewProductItems({
    db,
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
      db,
      newFreeTrial: freeTrial,
      curFreeTrial: null,
      internalProductId: newProduct.internal_id,
      isCustom: false,
    });
  }

  res.status(200).send(newProduct);
};
