import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
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
      const { productId } = req.params;
      const sb = req.sb;
      const orgId = req.orgId;
      const env = req.env;

      const [org, product] = await Promise.all([
        OrgService.getFullOrg({
          sb,
          orgId,
        }),
        ProductService.getProductStrict({
          sb,
          productId,
          orgId,
          env,
        }),
      ]);

      if (!product) {
        throw new RecaseError({
          message: `Product ${productId} not found`,
          code: ErrCode.ProductNotFound,
          statusCode: 404,
        });
      }

      let cusProducts = await CusProductService.getByInternalProductId(
        sb,
        product.internal_id
      );

      if (cusProducts.length > 0) {
        throw new RecaseError({
          message: "Cannot delete product with customers",
          code: ErrCode.ProductHasCustomers,
          statusCode: 400,
        });
      }

      // 2. Delete prices, entitlements, and product
      await ProductService.deleteByInternalId({
        sb,
        internalId: product.internal_id,
        orgId,
        env,
      });

      res.status(200).send({ message: "Product deleted" });
      return;
    },
  });
