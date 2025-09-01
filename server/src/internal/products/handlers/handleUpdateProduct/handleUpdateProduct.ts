import RecaseError from "@/utils/errorUtils.js";
import { Entitlement, ErrCode, FullProduct, Price, UpdateProductSchema } from "@autumn/shared";

import { ProductService } from "../../ProductService.js";
import { notNullish } from "@/utils/genUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import { handleNewFreeTrial } from "@/internal/products/free-trials/freeTrialUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { handleVersionProductV2 } from "../handleVersionProduct.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { handleUpdateProductDetails } from "./updateProductDetails.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";
import { productsAreSame } from "../../productUtils/compareProductUtils.js";
import { initProductInStripe } from "../../productUtils.js";
import {
  disableCurrentDefault,
  handleCreateProduct,
} from "../handleCreateProduct.js";
import { mapToProductItems } from "../../productV2Utils.js";
import { validateOneOffTrial } from "../../free-trials/freeTrialUtils.js";

export const handleUpdateProductV2 = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "Update product",
    handler: async () => {
      const { productId } = req.params;
      const { version, upsert, disable_version } = req.query;
      const { orgId, env, logger, db } = req;

      const [features, org, fullProduct, rewardPrograms, defaultProds] =
        await Promise.all([
          FeatureService.getFromReq(req),
          OrgService.getFromReq(req),
          ProductService.getFull({
            db,
            idOrInternalId: productId,
            orgId,
            env,
            version: version ? parseInt(version) : undefined,
            allowNotFound: upsert == "true",
          }),
          RewardProgramService.getByProductId({
            db,
            productIds: [productId],
            orgId,
            env,
          }),
          ProductService.listDefault({
            db,
            orgId,
            env,
          }),
        ]);

      if (!fullProduct) {
        if (upsert == "true") {
          await handleCreateProduct(req, res);
          return;
        }

        throw new RecaseError({
          message: "Product not found",
          code: ErrCode.ProductNotFound,
          statusCode: 404,
        });
      }

      const cusProductsCurVersion =
        await CusProductService.getByInternalProductId({
          db,
          internalProductId: fullProduct.internal_id,
        });

      let cusProductExists = cusProductsCurVersion.length > 0;

      // console.log("Updating product", {
      //   id: fullProduct.id,
      //   body: req.body,
      // });
      await disableCurrentDefault({
        req,
        newProduct: {
          ...fullProduct,
          ...req.body,
        },
        items:
          req.body.items ||
          mapToProductItems({
            prices: fullProduct.prices,
            entitlements: fullProduct.entitlements,
            features,
          }),
        freeTrial: req.body.free_trial || fullProduct.free_trial || null,
      });

      await handleUpdateProductDetails({
        db,
        curProduct: fullProduct,
        newProduct: UpdateProductSchema.parse(req.body),
        newFreeTrial: req.body.free_trial,
        items: req.body.items,
        org,
        rewardPrograms,
        logger,
      });

      let itemsExist = notNullish(req.body.items);
      if (cusProductExists && itemsExist) {
        if (disable_version == "true") {
          throw new RecaseError({
            message: "Cannot auto save product as there are existing customers",
            code: ErrCode.InvalidRequest,
            statusCode: 400,
          });
          return;
        }

        const { itemsSame, freeTrialsSame } = productsAreSame({
          newProductV2: req.body,
          curProductV1: fullProduct,
          features,
        });
        const productSame = itemsSame && freeTrialsSame;
        if (!productSame) {
          await handleVersionProductV2({
            req,
            res,
            latestProduct: fullProduct,
            org,
            env,
            items: req.body.items,
            freeTrial: req.body.free_trial,
          });
          return;
        }
        res.status(200).send(fullProduct);
        return;
      }

      const { items, free_trial } = req.body;

      if (fullProduct.prices?.length > 0 && (!items || items.length === 0)) {
        throw new RecaseError({
          message: "Cannot update a paid product to a free product. Please cancel the current product first.",
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      if (free_trial !== undefined) {
        await validateOneOffTrial({
          prices: fullProduct.prices,
          freeTrial: free_trial,
        });
      }
      
      const { prices, entitlements } = await handleNewProductItems({
        db,
        curPrices: fullProduct.prices,
        curEnts: fullProduct.entitlements,
        newItems: items,
        features,
        product: fullProduct,
        logger,
        isCustom: false,
      });

      if(free_trial !== undefined) {
        await validateOneOffTrial({
          prices,
          freeTrial: free_trial,
        });

        await handleNewFreeTrial({
          db,
          curFreeTrial: fullProduct.free_trial,
          newFreeTrial: free_trial,
          internalProductId: fullProduct.internal_id,
          isCustom: false,
          product: fullProduct,
        });
      }

      await initProductInStripe({
        db,
        product: {
          ...fullProduct,
          prices,
          entitlements,
        } as FullProduct,
        org,
        env,
        logger,
      });

      logger.info("Adding task to queue to detect base variant");
      await addTaskToQueue({
        jobName: JobName.DetectBaseVariant,
        payload: {
          curProduct: {
            ...fullProduct,
            prices: prices.length > 0 ? prices : fullProduct.prices,
            entitlements,
          },
        },
      });

      res.status(200).send({ message: "Product updated" });
      return;
    },
  });
