import { ProductService } from "@/internal/products/ProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import { routeHandler } from "@/utils/routerUtils.js";
import express from "express";
import { constructMigrationJob } from "@/internal/migrations/migrationUtils.js";
import { MigrationService } from "@/internal/migrations/MigrationService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { pricesOnlyOneOff } from "@/internal/prices/priceUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";

export const migrationRouter = express.Router();

migrationRouter.post("", async (req: any, res: any) => {
  return routeHandler({
    req,
    res,
    action: "migrate",
    handler: async (req: any, res: any) => {
      const { orgId, env, sb } = req;

      const { from_product_id, from_version, to_product_id, to_version } =
        req.body;

      let fromProduct = await ProductService.getFullProduct({
        sb,
        env,
        orgId,
        productId: from_product_id,
        version: from_version,
      });

      let toProduct = await ProductService.getFullProduct({
        sb,
        env,
        orgId,
        productId: to_product_id,
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

      // 1. Create migration JOB
      let migrationJob = constructMigrationJob({
        fromProduct,
        toProduct,
      });

      await MigrationService.createJob({
        sb,
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
