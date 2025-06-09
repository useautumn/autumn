import { ProductService } from "@/internal/products/ProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  BillingType,
  CusProductStatus,
  ErrCode,
  UsagePriceConfig,
} from "@autumn/shared";
import { routeHandler } from "@/utils/routerUtils.js";
import express from "express";
import { constructMigrationJob } from "@/internal/migrations/migrationUtils.js";
import { MigrationService } from "@/internal/migrations/MigrationService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import {
  getBillingType,
  pricesOnlyOneOff,
} from "@/internal/products/prices/priceUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { findPrepaidPrice } from "../products/prices/priceUtils/findPriceUtils.js";

export const migrationRouter = express.Router();

migrationRouter.post("", async (req: any, res: any) => {
  return routeHandler({
    req,
    res,
    action: "migrate",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { orgId, env, db, features } = req;

      const { from_product_id, from_version, to_product_id, to_version } =
        req.body;

      let fromProduct = await ProductService.getFull({
        db,
        env,
        orgId,
        idOrInternalId: from_product_id,
        version: from_version,
      });

      let toProduct = await ProductService.getFull({
        db,
        env,
        orgId,
        idOrInternalId: to_product_id,
        version: to_version,
      });

      if (
        isFreeProduct(fromProduct.prices) &&
        !isFreeProduct(toProduct.prices)
      ) {
        throw new RecaseError({
          message: `Cannot migrate customers from free product to paid product`,
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      // Check if from product is one off, or to product is one off
      if (
        pricesOnlyOneOff(fromProduct.prices) ||
        pricesOnlyOneOff(toProduct.prices)
      ) {
        let fromIsOneOff = pricesOnlyOneOff(fromProduct.prices);
        let msg = fromIsOneOff
          ? `${fromProduct.name} is a one off product, cannot migrate customers on it`
          : `${toProduct.name} is a one off product, cannot migrate customers to this product`;

        throw new RecaseError({
          message: msg,
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      if (fromProduct.is_add_on || toProduct.is_add_on) {
        throw new RecaseError({
          message: `Cannot migrate customers for add on products`,
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      for (const price of toProduct.prices) {
        let billingType = getBillingType(price.config);
        if (billingType != BillingType.UsageInAdvance) continue;

        let config = price.config as UsagePriceConfig;
        let internalFeatureId = config.internal_feature_id;
        let feature = features.find((f) => f.internal_id == internalFeatureId)!;

        for (const price of fromProduct.prices) {
          let prepaidPrice = findPrepaidPrice({
            prices: fromProduct.prices,
            internalFeatureId,
          });

          if (!prepaidPrice) {
            throw new RecaseError({
              message: `New product has prepaid price for feature ${feature.name}, but old product does not, can't perform migration`,
              code: ErrCode.InvalidRequest,
              statusCode: 400,
            });
          }
        }
      }

      if (
        !isFreeProduct(fromProduct.prices) &&
        isFreeProduct(toProduct.prices)
      ) {
        throw new RecaseError({
          message: `Cannot migrate customers from paid product to free product`,
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      if (
        isFreeProduct(fromProduct.prices) &&
        !isFreeProduct(toProduct.prices)
      ) {
        throw new RecaseError({
          message: `Cannot migrate customers from free product to paid product`,
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      // 1. Create migration JOB
      let migrationJob = constructMigrationJob({
        fromProduct,
        toProduct,
      });

      await MigrationService.createJob({
        db,
        data: migrationJob,
      });

      if (!fromProduct || !toProduct) {
        throw new RecaseError({
          message: `Product ${from_product_id} version ${from_version} or ${to_product_id} version ${to_version} not found`,
          code: ErrCode.ProductNotFound,
          statusCode: 404,
        });
      }

      await addTaskToQueue({
        jobName: JobName.Migration,
        payload: {
          migrationJobId: migrationJob.id,
        },
      });

      res.status(200).json(migrationJob);
    },
  });
});
