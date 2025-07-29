import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { Request, Response } from "express";
import { CusService } from "../CusService.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { CusProductService } from "../cusProducts/CusProductService.js";
import { z } from "zod";
const TransferProductSchema = z.object({
  from_entity_id: z.string(),
  to_entity_id: z.string(),
  product_id: z.string(),
});

export const handleTransferProduct = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "transfer product",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { customer_id } = req.params;
      const { from_entity_id, to_entity_id, product_id } =
        TransferProductSchema.parse(req.body);

      const customer = await CusService.getFull({
        idOrInternalId: customer_id,
        orgId: req.orgId,
        env: req.env,
        db: req.db,
        withEntities: true,
        // entityId: from_entity_id,
      });

      const fromEntity = customer.entities.find(
        (e: any) => e.id === from_entity_id
      );

      const toEntity = customer.entities.find(
        (e: any) => e.id === to_entity_id
      );

      if (!fromEntity) {
        throw new RecaseError({
          code: ErrCode.EntityNotFound,
          message: `Entity ${from_entity_id} not found`,
          statusCode: 404,
        });
      }

      if (!toEntity) {
        throw new RecaseError({
          code: ErrCode.EntityNotFound,
          message: `Entity ${to_entity_id} not found`,
          statusCode: 404,
        });
      }

      const cusProduct = customer.customer_products.find(
        (cp: any) =>
          cp.internal_entity_id === fromEntity.internal_id &&
          cp.product.id === product_id
      );

      if (!cusProduct) {
        throw new RecaseError({
          code: ErrCode.CusProductNotFound,
          message: `Product ${product_id} not found for entity ${from_entity_id}`,
          statusCode: 404,
        });
      }

      // const cusProduct = customer.customer_products.find(
      //   (cp: any) => cp.id === customer_product_id
      // );

      // if (!cusProduct) {
      //   throw new RecaseError({
      //     code: ErrCode.CusProductNotFound,
      //     message: "Customer product not found",
      //     statusCode: 404,
      //   });
      // }

      // let entity = customer.entities.find(
      //   (e: any) => e.internal_id === internal_entity_id
      // );

      // if (!entity) {
      //   throw new RecaseError({
      //     code: ErrCode.EntityNotFound,
      //     message: "Entity not found",
      //     statusCode: 404,
      //   });
      // }

      await CusProductService.update({
        db: req.db,
        cusProductId: cusProduct.id,
        updates: {
          entity_id: toEntity.id,
          internal_entity_id: toEntity.internal_id,
        },
      });

      res.status(200).json({
        // message: "Product transferred successfully",
        success: true,
      });
    },
  });
