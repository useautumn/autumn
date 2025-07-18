import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

import { ProductService } from "@/internal/products/ProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ErrCode } from "@autumn/shared";

export const handleDeleteProduct = (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "delete product",
    handler: async () => {
      const { db, orgId, env } = req;
      const { productId } = req.params;

      const product = await ProductService.get({
        db,
        id: productId,
        orgId,
        env,
      });

      if (!product) {
        throw new RecaseError({
          message: `Product ${productId} not found`,
          code: ErrCode.ProductNotFound,
          statusCode: 404,
        });
      }

      let cusProducts = await CusProductService.getByInternalProductId({
        db,
        internalProductId: product.internal_id,
      });

      if (cusProducts.length > 0) {
        throw new RecaseError({
          message: "Cannot delete product with customers",
          code: ErrCode.ProductHasCustomers,
          statusCode: 400,
        });
      }

      // 2. Delete prices, entitlements, and product
      await ProductService.deleteByInternalId({
        db,
        internalId: product.internal_id,
        orgId,
        env,
      });

      res.status(200).json({ message: "Product deleted" });
      return;
    },
  });
