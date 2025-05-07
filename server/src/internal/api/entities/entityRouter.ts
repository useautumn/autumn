import { Router } from "express";
import { handleCreateEntity } from "./handleCreateEntity.js";
import { handleDeleteEntity } from "./handleDeleteEntity.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { EntityService } from "./EntityService.js";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { handleGetEntity } from "./handleGetEntity.js";

export const entityRouter = Router({ mergeParams: true });

// List entityes
entityRouter.get("", (req, res) =>
  routeHandler({
    req,
    res,
    action: "listEntities",
    handler: async (req, res) => {
      const customerId = req.params.customer_id as string;
      let { orgId, env, sb, logtail: logger } = req;

      let customer = await CusService.getById({
        id: customerId,
        orgId,
        env,
        sb,
        logger,
      });

      if (!customer) {
        throw new RecaseError({
          message: `Customer ${customerId} not found`,
          code: ErrCode.CustomerNotFound,
        });
      }

      const entities = await EntityService.get({
        orgId,
        env,
        sb,
        internalCustomerId: customer.internal_id,
      });

      res.status(200).json({
        data: entities,
      });
    },
  })
);

entityRouter.get("/:entity_id", handleGetEntity);

// 1. Create entity
entityRouter.post("", handleCreateEntity);

// 2. Delete entity
entityRouter.delete("/:entity_id", handleDeleteEntity);
