import { Router } from "express";

import { routeHandler } from "@/utils/routerUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { handleGetEntity } from "./handlers/handleGetEntity.js";
import { handlePostEntityRequest } from "../../entities/handlers/handleCreateEntity/handleCreateEntity.js";
import { handleDeleteEntity } from "./handlers/handleDeleteEntity.js";

export const entityRouter: Router = Router({ mergeParams: true });

// List entityes
entityRouter.get("", (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "listEntities",
    handler: async (req, res) => {
      const customerId = req.params.customer_id as string;
      let { orgId, env } = req;

      let customer = await CusService.getFull({
        db: req.db,
        idOrInternalId: customerId,
        orgId,
        env,
        withEntities: true,
      });

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
