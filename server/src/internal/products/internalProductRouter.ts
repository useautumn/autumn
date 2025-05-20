import { Router } from "express";
import { FeatureService } from "../features/FeatureService.js";
import { entitlementRouter } from "./entitlementRouter.js";
import { StatusCodes } from "http-status-codes";
import { ProductService } from "./ProductService.js";
import { ErrCode, UsageModel } from "@autumn/shared";
import { FeatureOptions } from "@autumn/shared";
import { OrgService } from "../orgs/OrgService.js";
import { RewardService } from "../rewards/RewardService.js";
import { getProductVersionCounts } from "./productUtils.js";
import { getLatestProducts } from "./productUtils.js";
import { CusProdReadService } from "../customers/products/CusProdReadService.js";
import { MigrationService } from "../migrations/MigrationService.js";
import { RewardProgramService } from "../rewards/RewardProgramService.js";
import { mapToProductV2 } from "./productV2Utils.js";
import { isFeaturePriceItem } from "./product-items/productItemUtils.js";

import RecaseError, { handleFrontendReqError } from "@/utils/errorUtils.js";

export const productRouter = Router({ mergeParams: true });

productRouter.get("/", async (req: any, res) => {
  try {
    let sb = req.sb;
    let products = await ProductService.getFullProducts({
      sb,
      orgId: req.orgId,
      env: req.env,
    });

    res.status(200).send(products);
  } catch (error) {
    handleFrontendReqError({
      error,
      req,
      res,
      action: "Get products (internal)",
    });
  }
});

productRouter.get("/data", async (req: any, res) => {
  try {
    let { sb } = req;

    const [products, features, org, coupons, rewardPrograms] =
      await Promise.all([
        ProductService.getFullProducts({
          sb,
          orgId: req.orgId,
          env: req.env,
          returnAll: true,
        }),
        FeatureService.getFromReq(req),
        OrgService.getFromReq(req),
        RewardService.getAll({ sb, orgId: req.orgId, env: req.env }),
        RewardProgramService.getAll({ sb, orgId: req.orgId, env: req.env }),
      ]);

    res.status(200).json({
      products: getLatestProducts(products).map((product) => {
        return mapToProductV2({ product, features });
      }),
      versionCounts: getProductVersionCounts(products),
      features,
      org: {
        id: org.id,
        name: org.name,
        // test_pkey: org.test_pkey,
        // live_pkey: org.live_pkey,
        default_currency: org.default_currency,
        stripe_connected: org.stripe_connected,
      },
      // coupons,
      rewards: coupons,
      rewardPrograms,
    });
  } catch (error) {
    console.error("Failed to get products", error);
    res.status(500).send(error);
  }
});

productRouter.get("/counts", async (req: any, res) => {
  try {
    let { sb, orgId, env } = req;
    let products = await ProductService.getFullProducts({
      sb,
      orgId: req.orgId,
      env: req.env,
      returnAll: true,
    });

    let counts = await Promise.all(
      products.map(async (product) => {
        return CusProdReadService.getCounts({
          sb,
          internalProductId: product.internal_id,
        });
      })
    );

    // let result: { [key: string]: any } = {};

    // for (let i = 0; i < products.length; i++) {
    //   result[products[i].internal_id] = counts[i];
    // }
    // Group by ID
    let result: { [key: string]: any } = {};
    for (let i = 0; i < products.length; i++) {
      if (!result[products[i].id]) {
        result[products[i].id] = counts[i];
      } else {
        for (let key in counts[i]) {
          let countVal = counts[i][key as keyof (typeof counts)[number]] || 0;
          result[products[i].id][key] += countVal;
        }
      }
    }

    res.status(200).send(result);
  } catch (error) {
    console.error("Failed to get product counts", error);
    res.status(500).send(error);
  }
});

// Get stripe products

productRouter.get("/:productId/data", async (req: any, res) => {
  try {
    const { productId } = req.params;
    const { version } = req.query;
    const sb = req.sb;
    const orgId = req.orgId;
    const env = req.env;

    const [product, features, org, numVersions, existingMigrations] =
      await Promise.all([
        ProductService.getFullProduct({
          sb,
          productId,
          orgId,
          env,
          version: version ? parseInt(version) : undefined,
        }),
        FeatureService.getFeatures({
          sb,
          orgId,
          env,
        }),
        OrgService.getFromReq(req),
        ProductService.getProductVersionCount({
          sb,
          productId,
          orgId,
          env,
        }),
        MigrationService.getExistingJobs({
          sb,
          orgId,
          env,
        }),
      ]);

    if (!product) {
      throw new RecaseError({
        message: `Product ${productId} ${
          version ? `(v${version})` : ""
        } not found`,
        code: ErrCode.ProductNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }
    let entitlements = product.entitlements;
    let prices = product.prices;

    entitlements = entitlements.sort((a: any, b: any) => {
      return b.feature.id.localeCompare(a.feature.id);
    });

    prices = prices.sort((a: any, b: any) => {
      return b.name.localeCompare(a.name);
    });

    let productV2 = mapToProductV2({ product, features });

    res.status(200).send({
      product: productV2,
      entitlements,
      prices,
      features,
      org: {
        id: org.id,
        name: org.name,
        test_pkey: org.test_pkey,
        live_pkey: org.live_pkey,
        default_currency: org.default_currency,
      },
      numVersions,
      existingMigrations,
    });
  } catch (error) {
    handleFrontendReqError({
      error,
      req,
      res,
      action: "Get product data (internal)",
    });
  }
});

productRouter.get("/:productId/count", async (req: any, res) => {
  try {
    const { productId } = req.params;
    const { version } = req.query;

    const product = await ProductService.getProductStrict({
      sb: req.sb,
      productId,
      orgId: req.orgId,
      env: req.env,
      version: version ? parseInt(version) : undefined,
    });

    if (!product) {
      throw new RecaseError({
        message: `Product ${productId} ${
          version ? `(v${version})` : ""
        } not found`,
        code: ErrCode.ProductNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    // Get counts from postgres
    const counts = await CusProdReadService.getCounts({
      sb: req.sb,
      internalProductId: product.internal_id,
    });

    res.status(200).send(counts);
  } catch (error) {
    handleFrontendReqError({
      error,
      req,
      res,
      action: "Get product counts (internal)",
    });
  }
});

productRouter.use(entitlementRouter);

productRouter.post("/product_options", async (req: any, res: any) => {
  try {
    const { items } = req.body;

    const features = await FeatureService.getFromReq(req);
    const featureToOptions: { [key: string]: FeatureOptions } = {};

    for (const item of items) {
      if (isFeaturePriceItem(item) && item.usage_model == UsageModel.Prepaid) {
        featureToOptions[item.feature_id] = {
          feature_id: item.feature_id,
          quantity: 0,
        };
      }
    }

    res.status(200).send({ options: Object.values(featureToOptions) });
  } catch (error) {
    handleFrontendReqError({
      error,
      req,
      res,
      action: "Get product options",
    });
  }
});
