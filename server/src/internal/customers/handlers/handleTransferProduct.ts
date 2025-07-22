import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { Request, Response } from "express";
import { CusService } from "../CusService.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { CusProductService } from "../cusProducts/CusProductService.js";

export const handleTransferProduct = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "transfer product",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { customer_id } = req.params;
      const { internal_entity_id, customer_product_id } = req.body;

      const customer = await CusService.getFull({
        idOrInternalId: customer_id,
        orgId: req.orgId,
        env: req.env,
        db: req.db,
        withEntities: true,
      });

      const cusProduct = customer.customer_products.find(
        (cp: any) => cp.id === customer_product_id
      );

      if (!cusProduct) {
        throw new RecaseError({
          code: ErrCode.CusProductNotFound,
          message: "Customer product not found",
          statusCode: 404,
        });
      }

      let entity = customer.entities.find(
        (e: any) => e.internal_id === internal_entity_id
      );

      if (!entity) {
        throw new RecaseError({
          code: ErrCode.EntityNotFound,
          message: "Entity not found",
          statusCode: 404,
        });
      }

      await CusProductService.update({
        db: req.db,
        cusProductId: customer_product_id,
        updates: {
          entity_id: entity.id,
          internal_entity_id: entity.internal_id,
        },
      });

      res.status(200).json({
        message: "Product transferred successfully",
      });
    },
  });
