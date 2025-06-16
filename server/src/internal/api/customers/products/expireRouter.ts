import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusProductStatus, ErrCode, FullCusProduct } from "@autumn/shared";
import { Router } from "express";
import { expireCusProduct } from "../../../customers/handlers/handleCusProductExpired.js";

const expireRouter: Router = Router();

expireRouter.post("", async (req, res) =>
  routeHandler({
    req,
    res,
    action: "expire",
    handler: async (req, res) => {
      let { db, orgId, env, logtail: logger } = req;
      let { customer_id, product_id, entity_id, cancel_immediately } = req.body;

      let expireImmediately = cancel_immediately || false;

      let [customer, org] = await Promise.all([
        CusService.getFull({
          db,
          orgId,
          idOrInternalId: customer_id,
          env,
          withEntities: true,
          entityId: entity_id,
          inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
          allowNotFound: false,
        }),
        OrgService.getFromReq(req),
      ]);

      if (entity_id && !customer.entity) {
        throw new RecaseError({
          code: ErrCode.EntityNotFound,
          message: `Entity ${entity_id} not found for customer ${customer_id}`,
        });
      }

      let cusProducts = customer.customer_products;

      let cusProductsToExpire = cusProducts.filter(
        (cusProduct: FullCusProduct) =>
          cusProduct.product.id == product_id &&
          (entity_id ? cusProduct.entity_id == entity_id : true),
      );

      if (cusProductsToExpire.length == 0) {
        throw new RecaseError({
          code: ErrCode.ProductNotFound,
          message: `Product ${product_id} not found for customer ${customer_id}`,
        });
      }

      for (const cusProduct of cusProductsToExpire) {
        await expireCusProduct({
          req,
          db,
          cusProduct,
          cusProducts,
          org,
          env,
          logger,
          customer,
          expireImmediately,
        });
      }

      res.status(200).json({
        success: true,
        customer_id: customer_id,
        product_id: product_id,
      });
    },
  }),
);

export default expireRouter;
