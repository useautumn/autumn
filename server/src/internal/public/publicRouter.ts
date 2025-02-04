import { Router } from "express";
import { OrgService } from "../orgs/OrgService.js";
import {
  AppEnv,
  FullProduct,
  Price,
  PriceType,
  Product,
  PublicEntitlementSchema,
  PublicProductSchema,
  UsagePriceConfig,
} from "@autumn/shared";
import { ProductService } from "../products/ProductService.js";

export const publicRouter = Router();

const publicRouterMiddleware = async (req: any, res: any, next: any) => {
  const pkey = req.headers["x-publishable-key"];

  if (!pkey) {
    return res.status(400).json({ message: "Publishable key is required" });
  }

  if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_prod")) {
    return res.status(400).json({ message: "Invalid publishable key" });
  }

  let env: AppEnv = pkey.startsWith("am_pk_test")
    ? AppEnv.Sandbox
    : AppEnv.Live;

  // 2. Get orgId from publishable key
  const org = await OrgService.getFromPkey({
    sb: req.sb,
    pkey: pkey,
    env: env,
  });

  if (!org) {
    return res.status(400).json({ message: "Invalid publishable key" });
  }

  req.org = org;
  req.env = env;

  next();
};

publicRouter.use(publicRouterMiddleware);

const processProduct = (product: FullProduct) => {
  const ents = product.entitlements;
  const prices = product.prices;

  const fixedPrices = prices.filter(
    (p: Price) => p.config!.type === PriceType.Fixed
  );

  const processdEnts = [];

  for (const ent of ents) {
    const internalFeatureId = ent.internal_feature_id;

    const relatedPrice = prices.find((p: Price) => {
      let config = p.config as UsagePriceConfig;
      if (config.internal_feature_id === internalFeatureId) {
        return true;
      }
      return false;
    });

    const processedEnt: any = {
      ...ent,
    };
    if (relatedPrice) {
      processedEnt.price = relatedPrice.config;
    }
    processdEnts.push(PublicEntitlementSchema.parse(processedEnt));
  }

  let processedProduct: any = structuredClone(product);
  processedProduct.entitlements = processdEnts;
  processedProduct.fixed_prices = fixedPrices;
  delete processedProduct.prices;

  return PublicProductSchema.parse(processedProduct);
};

publicRouter.get("/products", async (req: any, res: any) => {
  const products = await ProductService.getFullProducts(
    req.sb,
    req.org.id,
    req.env
  );

  // Process product for frontend
  // 1. Fixed prices
  const processedProducts = products.map(processProduct);

  res.status(200).json(processedProducts);
});
