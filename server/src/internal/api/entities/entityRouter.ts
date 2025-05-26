import { Router } from "express";

import { routeHandler } from "@/utils/routerUtils.js";
import { EntityService } from "./EntityService.js";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { handleGetEntity } from "./handlers/handleGetEntity.js";
import { handlePostEntityRequest } from "./handlers/handleCreateEntity.js";
import { handleDeleteEntity } from "./handlers/handleDeleteEntity.js";

export const entityRouter = Router({ mergeParams: true });

// List entityes
entityRouter.get("", (req, res) =>
  routeHandler({
    req,
    res,
    action: "listEntities",
    handler: async (req, res) => {
      const customerId = req.params.customer_id as string;
      let { orgId, env } = req;

      let customer = await CusService.getWithProducts({
        sb: req.sb,
        idOrInternalId: customerId,
        orgId,
        env,
        withEntities: true,
      });

      if (!customer) {
        throw new RecaseError({
          message: `Customer ${customerId} not found`,
          code: ErrCode.CustomerNotFound,
        });
      }

      res.status(200).json({
        data: customer.entities,
      });
    },
  }),
);

// 1. Create entity
entityRouter.post("", handlePostEntityRequest);

// 2. Delete entity
entityRouter.delete("/:entity_id", handleDeleteEntity);

// 3. Get entity
entityRouter.get("/:entity_id", handleGetEntity);
