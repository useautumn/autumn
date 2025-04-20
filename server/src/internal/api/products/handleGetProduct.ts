import { ProductService } from "@/internal/products/ProductService.js";
import {
  mapToProductItems,
  mapToProductV2,
} from "@/internal/products/productV2Utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ErrCode, ProductResponseSchema } from "@autumn/shared";
import { ProductItemResponseSchema } from "@shared/models/productModels/productItemModels/prodItemResponseModels.js";
import { StatusCodes } from "http-status-codes";

export const handleGetProduct = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "get /products/:productId",
    handler: async () => {
      const { productId } = req.params;
      let { schemaVersion } = req.query;

      const sb = req.sb;
      const orgId = req.orgId;
      const env = req.env;

      if (!productId) {
        throw new RecaseError({
          message: "Product ID is required",
          code: ErrCode.InvalidRequest,
        });
      }

      let product = await ProductService.getFullProduct({
        sb,
        orgId,
        env,
        productId,
      });

      if (!product) {
        throw new RecaseError({
          message: `Product ${productId} not found`,
          code: ErrCode.ProductNotFound,
          statusCode: StatusCodes.NOT_FOUND,
        });
      }

      schemaVersion = schemaVersion ? parseInt(schemaVersion) : 2;

      if (schemaVersion == 1) {
        res.status(200).json(product);
      } else {
        // let v2Product = mapToProductV2(product);
        res.status(200).json(
          ProductResponseSchema.parse({
            ...product,
            name: product.name || null,
            group: product.group || null,
            autumn_id: product.internal_id,
            items: mapToProductItems({
              prices: product.prices,
              entitlements: product.entitlements,
            }).map((item) => {
              // console.log(item);
              return ProductItemResponseSchema.parse(item);
            }),
          })
        );
      }
    },
  });
