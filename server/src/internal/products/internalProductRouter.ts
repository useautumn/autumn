import { Router } from "express";
import { FeatureService } from "../features/FeatureService.js";
import { StatusCodes } from "http-status-codes";
import { ProductService } from "./ProductService.js";
import { ErrCode, UsageModel } from "@autumn/shared";
import { FeatureOptions } from "@autumn/shared";
import { OrgService } from "../orgs/OrgService.js";
import { RewardService } from "../rewards/RewardService.js";
import { getGroupToDefaults, getProductVersionCounts } from "./productUtils.js";
import { getLatestProducts } from "./productUtils.js";
import { CusProdReadService } from "../customers/cusProducts/CusProdReadService.js";
import { MigrationService } from "../migrations/MigrationService.js";
import { RewardProgramService } from "../rewards/RewardProgramService.js";
import { mapToProductV2 } from "./productV2Utils.js";
import { isFeaturePriceItem } from "./product-items/productItemUtils/getItemType.js";

import RecaseError, {
  handleFrontendReqError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import { createOrgResponse } from "../orgs/orgUtils.js";
import { sortFullProducts } from "./productUtils/sortProductUtils.js";
import { getGroupToDefaultProd } from "../customers/cusUtils/createNewCustomer.js";

export const productRouter: Router = Router({ mergeParams: true });

productRouter.get("/data", async (req: any, res) => {
  try {
    let { db } = req;

    const allVersions = req.query.all_versions === "true";

    const [products, features, org, coupons, rewardPrograms, defaultProds] =
      await Promise.all([
        ProductService.listFull({
          db,
          orgId: req.orgId,
          env: req.env,
          archived: false,
          returnAll: allVersions,
        }),
        FeatureService.getFromReq(req),
        OrgService.getFromReq(req),
        RewardService.list({ db, orgId: req.orgId, env: req.env }),
        RewardProgramService.list({
          db,
          orgId: req.orgId,
          env: req.env,
        }),
        ProductService.listDefault({
          db,
          orgId: req.orgId,
          env: req.env,
        }),
      ]);

    sortFullProducts({
      products: getLatestProducts(products),
    });

    const groupToDefaultProd = getGroupToDefaults({
      defaultProds,
    });

    res.status(200).json({
      products: products.map((product) => {
        return mapToProductV2({ product, features });
      }),
      versionCounts: getProductVersionCounts(products),
      features,
      org: createOrgResponse({ org, env: req.env }),
      rewards: coupons,
      rewardPrograms,
      groupToDefaults: groupToDefaultProd,
    });
  } catch (error) {
    console.error("Failed to get products", error);
    res.status(500).send(error);
  }
});

productRouter.post("/data", async (req: any, res) => {
  try {
    let { db } = req;
    let { showArchived } = req.body;

    const [products, defaultProds, features, org, coupons, rewardPrograms] =
      await Promise.all([
        ProductService.listFull({
          db,
          orgId: req.orgId,
          env: req.env,
          // returnAll: true,
          archived: showArchived,
        }),
        ProductService.listDefault({
          db,
          orgId: req.orgId,
          env: req.env,
        }),
        FeatureService.getFromReq(req),
        OrgService.getFromReq(req),
        RewardService.list({ db, orgId: req.orgId, env: req.env }),
        RewardProgramService.list({
          db,
          orgId: req.orgId,
          env: req.env,
        }),
      ]);

    // Group to default product
    const groupToDefaultProd = getGroupToDefaults({
      defaultProds,
    });

    res.status(200).json({
      products: sortFullProducts({ products }).map((product) => {
        return mapToProductV2({ product, features });
      }),
      groupToDefaults: groupToDefaultProd,
      versionCounts: getProductVersionCounts(products),
      features,
      org: createOrgResponse({ org, env: req.env }),
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
    let { db } = req;
    let products = await ProductService.listFull({
      db,
      orgId: req.orgId,
      env: req.env,
      // returnAll: true,
    });

    const latestVersion = req.query.latest_version === "true";

    let counts = await Promise.all(
      products.map(async (product) => {
        if (latestVersion) {
          return CusProdReadService.getCounts({
            db,
            internalProductId: product.internal_id,
          });
        }

        return CusProdReadService.getCountsForAllVersions({
          db,
          productId: product.id,
          orgId: req.orgId,
          env: req.env,
        });
      })
    );

    let result: { [key: string]: any } = {};
    for (let i = 0; i < products.length; i++) {
      if (!result[products[i].id]) {
        result[products[i].id] = counts[i];
      }
    }

    res.status(200).send(result);
  } catch (error) {
    console.error("Failed to get product counts", error);
    res.status(500).send(error);
  }
});

productRouter.get("/:productId/data", async (req: any, res) => {
  try {
    const { productId } = req.params;
    const { version } = req.query;
    const { db, orgId, env } = req;

    const [product, features, org, numVersions, existingMigrations] =
      await Promise.all([
        ProductService.getFull({
          db,
          idOrInternalId: productId,
          orgId,
          env,
          version: version ? parseInt(version) : undefined,
        }),
        FeatureService.getFromReq(req),
        OrgService.getFromReq(req),
        ProductService.getProductVersionCount({
          db,
          productId,
          orgId,
          env,
        }),
        MigrationService.getExistingJobs({
          db,
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

    const defaultProds = await ProductService.listDefault({
      db,
      orgId: req.orgId,
      env: req.env,
      group: product.group,
    });

    const groupDefaults = getGroupToDefaults({
      defaultProds,
    })?.[product.group];

    let entitlements = product.entitlements;
    let prices = product.prices;

    entitlements = entitlements.sort((a: any, b: any) => {
      return b.feature.id.localeCompare(a.feature.id);
    });

    prices = prices.sort((a: any, b: any) => {
      return b.id.localeCompare(a.id);
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
      groupDefaults: groupDefaults,
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
    const { db, orgId, env } = req;
    const { productId } = req.params;
    const { version } = req.query;

    const product = await ProductService.get({
      db,
      id: productId,
      orgId,
      env,
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
      db,
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

productRouter.get("/:productId/info", async (req: any, res: any) => {
  try {
    // 1. Get number of versions
    const { db, orgId, env } = req;
    let product = await ProductService.get({
      db,
      id: req.params.productId,
      orgId: req.orgId,
      env: req.env,
    });

    if (!product) {
      throw new RecaseError({
        message: `Product ${req.params.productId} not found`,
        code: ErrCode.ProductNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    let [allVersions, latestVersion, deletionText] = await Promise.all([
      CusProdReadService.existsForProduct({
        db,
        productId: req.params.productId,
      }),
      CusProdReadService.existsForProduct({
        db,
        internalProductId: product.internal_id,
      }),
      ProductService.getDeletionText({
        db,
        productId: req.params.productId,
        orgId: req.orgId,
        env: req.env,
      }),
    ]);

    // 2. Get cus products

    res.status(200).send({
      numVersion: product.version,
      hasCusProducts: allVersions,
      hasCusProductsLatest: latestVersion,
      customerName:
        deletionText[0]?.name || deletionText[0]?.email || deletionText[0]?.id,
      totalCount: deletionText[0]?.totalCount,
    });
  } catch (error) {
    handleRequestError({
      error,
      req,
      res,
      action: "Get product info",
    });
  }
});

productRouter.get("/rewards", async (req: any, res: any) => {
  try {
    const { db, orgId, env } = req;

    const rewards = await RewardService.list({
      db,
      orgId,
      env,
    });

    res.status(200).send({ rewards });
  } catch (error) {
    handleFrontendReqError({
      error,
      req,
      res,
      action: "Get rewards",
    });
  }
});
