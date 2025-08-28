import { validateProductItems } from "@/internal/products/product-items/validateProductItems.js";
import {
  handleNewFreeTrial,
  validateAndInitFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import {
  CreateProductSchema,
  Entitlement,
  ErrCode,
  FreeTrial,
  FullProduct,
  Price,
  ProductResponseSchema,
} from "@autumn/shared";
import {
  keyToTitle,
  notNullish,
  nullish,
  validateId,
} from "@/utils/genUtils.js";

import { ProductService } from "@/internal/products/ProductService.js";
import {
  constructProduct,
  initProductInStripe,
} from "@/internal/products/productUtils.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { detectBaseVariant } from "../productUtils/detectProductVariant.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";
import * as traceroot from "traceroot-sdk-ts";

const validateCreateProduct = async ({ req }: { req: ExtendedRequest }) => {
  let { free_trial, items } = req.body;
  let { orgId, env, db, features } = req;

  let productData = CreateProductSchema.parse(req.body);

  validateId("Product", productData.id);

  if (nullish(req.body.name)) {
    productData.name = keyToTitle(productData.id);
  }

  const existing = await ProductService.get({
    db,
    orgId,
    env,
    id: productData.id,
  });

  // 1. If existing product, throw error
  if (existing) {
    throw new RecaseError({
      message: `Product ${productData.id} already exists`,
      code: ErrCode.ProductAlreadyExists,
      statusCode: 400,
    });
  }

  // 2. Validate items if exist

  if (items && !Array.isArray(items)) {
    throw new RecaseError({
      message: "Items must be an array",
      code: ErrCode.InvalidRequest,
      statusCode: 400,
    });
  } else if (items) {
    validateProductItems({
      newItems: items,
      features,
      orgId: req.orgId,
      env: req.env,
    });
  }

  // 3. Validate free trial if exist
  let freeTrial: FreeTrial | null = null;
  if (notNullish(free_trial)) {
    freeTrial = validateAndInitFreeTrial({
      freeTrial: free_trial,
      internalProductId: productData.id,
      isCustom: false,
    });
  }

  return {
    features,
    freeTrial,
    productData,
  };
};

export const handleCreateProduct = async (req: Request, res: any) =>
  routeHandler({
    req,
    res,
    action: "POST /products",
    handler: async (req, res) => {
      const tracedFunction = traceroot.traceFunction(async () => {
        let { items } = req.body;
        let { logtail: logger, org, features, env, db } = req;

        let { freeTrial, productData } = await validateCreateProduct({
          req,
        });

        let newProduct = constructProduct({
          productData,
          orgId: org.id,
          env,
        });

        let product = await ProductService.insert({ db, product: newProduct });

        let prices: Price[] = [];
        let entitlements: Entitlement[] = [];
        if (notNullish(items)) {
          const res = await handleNewProductItems({
            db,
            product,
            features,
            curPrices: [],
            curEnts: [],
            newItems: items,
            logger,
            isCustom: false,
            newVersion: false,
          });
          prices = res.prices;
          entitlements = res.entitlements;
        }

        await initProductInStripe({
          db,
          product: {
            ...product,
            prices,
            entitlements,
          } as FullProduct,
          org,
          env,
          logger,
        });

        if (notNullish(freeTrial)) {
          await handleNewFreeTrial({
            db,
            newFreeTrial: freeTrial,
            curFreeTrial: null,
            internalProductId: product.internal_id,
            isCustom: false,
          });
        }

        await addTaskToQueue({
          jobName: JobName.DetectBaseVariant,
          payload: {
            curProduct: {
              ...product,
              prices,
              entitlements: [],
            },
          },
        });

        res.status(200).json(
          ProductResponseSchema.parse({
            ...product,
            autumn_id: product.internal_id,
            items: items || [],
            free_trial: freeTrial,
          })
        );
      }, { spanName: 'handleCreateProduct' });
      
      return await tracedFunction();
    },
  });
