import { Router } from "express";
import { FeatureService } from "../features/FeatureService.js";
import { entitlementRouter } from "./entitlementRouter.js";
import { PriceService } from "../prices/PriceService.js";
import { ProductService } from "./ProductService.js";
import {
  CusProductStatus,
  EntitlementWithFeature,
  ErrCode,
  ProductItemBehavior,
} from "@autumn/shared";
import { BillingType } from "@autumn/shared";
import { FeatureOptions } from "@autumn/shared";
import { getBillingType } from "../prices/priceUtils.js";
import { OrgService } from "../orgs/OrgService.js";
import { RewardService } from "../rewards/RewardService.js";
import { getProductVersionCounts } from "./productUtils.js";
import { getLatestProducts } from "./productUtils.js";

import { CusProdReadService } from "../customers/products/CusProdReadService.js";
import { MigrationService } from "../migrations/MigrationService.js";
import { RewardProgramService } from "../rewards/RewardProgramService.js";
import { mapToProductV2 } from "./productV2Utils.js";
import {
  itemToPriceAndEnt,
  toFeatureAndPrice,
} from "./product-items/mapFromItem.js";
import {
  isFeaturePriceItem,
  itemIsFixedPrice,
} from "./product-items/productItemUtils.js";
import { toFeaturePriceItem } from "./product-items/mapToItem.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";

export const productRouter = Router({ mergeParams: true });

productRouter.get("/data", async (req: any, res) => {
  let sb = req.sb;

  try {
    await OrgService.getFullOrg({
      sb,
      orgId: req.orgId,
    });

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
      products: getLatestProducts(products),
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

    res.status(200).send({
      product: mapToProductV2(product),
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
    handleRequestError({
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
      });
    }

    // Get counts from postgres
    const counts = await CusProdReadService.getCounts({
      sb: req.sb,
      internalProductId: product.internal_id,
    });

    res.status(200).send(counts);
  } catch (error) {
    handleRequestError({
      error,
      req,
      res,
      action: "Get product counts (internal)",
    });
  }
});

productRouter.use(entitlementRouter);

productRouter.post("/product_options", async (req: any, res: any) => {
  const { items } = req.body;

  const features = await FeatureService.getFromReq(req);
  const featureToOptions: { [key: string]: FeatureOptions } = {};

  for (const item of items) {
    if (
      isFeaturePriceItem(item) &&
      item.behavior == ProductItemBehavior.Prepaid
    ) {
      featureToOptions[item.feature_id] = {
        feature_id: item.feature_id,
        quantity: 0,
      };
    }
    // if (isFeaturePriceItem(item)) {
    //   // console.log("Item: ", item);
    //   let { price, ent } = toFeatureAndPrice({
    //     item,
    //     orgId: req.orgId,
    //     internalFeatureId: item.feature_id,
    //     internalProductId: "",
    //     isCustom: false,
    //   });

    //   if (!price) {
    //     continue;
    //   }
    //   let billingType = getBillingType(price.config!);
    //   if (billingType === BillingType.UsageInAdvance) {

    //   }
    // }
  }
  // for (const price of prices) {
  //   // get billing tyoe
  //   const billingType = getBillingType(price.config);
  //   const feature = features.find(
  //     (f) => f.internal_id === price.config.internal_feature_id
  //   );

  //   if (billingType === BillingType.UsageInAdvance) {
  //     if (!featureToOptions[feature.id]) {
  //       featureToOptions[feature.id] = {
  //         feature_id: feature.id,
  //         quantity: 0,
  //       };
  //     }

  //     featureToOptions[feature.id].quantity = 0;
  //   }
  // }

  res.status(200).send({ options: Object.values(featureToOptions) });
});

// // Individual Product routes
// productRouter.get("/:productId", async (req: any, res) => {
//   const { productId } = req.params;
//   try {
//     const Product = await ProductService.getProductStrict({
//       sb: req.sb,
//       productId,
//       orgId: req.orgId,
//       env: req.env,
//     });

//     const entitlements = await ProductService.getEntitlementsByProductId({
//       sb: req.sb,
//       productId,
//       orgId: req.orgId,
//       env: req.env,
//     });

//     const prices = await PriceService.getPricesByProductId(req.sb, productId);

//     res.status(200).send({ Product, entitlements, prices });
//   } catch (error) {
//     console.log("Failed to get Product", error);
//     res.status(404).send("Product not found");
//     return;
//   }
// });
