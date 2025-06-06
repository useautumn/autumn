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
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

export const handleVersionProductV2 = async ({
  req,
  res,
  latestProduct,
  org,
  env,
  items,
  freeTrial,
}: {
  req: any;
  res: any;
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

  const { customPrices, customEnts } = await handleNewProductItems({
    db,
    curPrices: latestProduct.prices,
    curEnts: latestProduct.entitlements,
    newItems: items,
    features,
    product: newProduct,
    logger: console,
    isCustom: false,
    newVersion: true,
  });

  await EntitlementService.insert({
    db,
    data: customEnts,
  });

  await PriceService.insert({
    db,
    data: customPrices,
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
