import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusProductStatus, ErrCode, FullCusProduct } from "@autumn/shared";
import { Router } from "express";
import { expireCusProduct } from "../handlers/handleCusProductExpired.js";

const expireRouter = Router();

expireRouter.post("", async (req, res) =>
  routeHandler({
    req,
    res,
    action: "expire",
    handler: async (req, res) => {
      let { sb, orgId, env, logtail: logger } = req;
      let { customer_id, product_id } = req.body;

      let [customer, org] = await Promise.all([
        CusService.getById({ sb, orgId, id: customer_id, env, logger }),
        OrgService.getFromReq(req),
      ]);

      let cusProducts = await CusService.getFullCusProducts({
        sb,
        internalCustomerId: customer.internal_id,
        withProduct: true,
        withPrices: true,
        logger,
        inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
      });

      for (const cusProduct of cusProducts) {
        cusProduct.customer = customer;
      }

      let cusProductsToExpire = cusProducts.filter(
        (cusProduct: FullCusProduct) => cusProduct.product.id == product_id
      );

      if (cusProductsToExpire.length == 0) {
        throw new RecaseError({
          code: ErrCode.ProductNotFound,
          message: `Product ${product_id} not found for customer ${customer_id}`,
        });
      }

      for (const cusProduct of cusProductsToExpire) {
        await expireCusProduct({
          sb,
          cusProduct,
          cusProducts,
          org,
          env,
          logger,
        });
      }

      res.status(200).json({
        success: true,
        customer_id: customer_id,
        product_id: product_id,
      });
    },
  })
);

export default expireRouter;
