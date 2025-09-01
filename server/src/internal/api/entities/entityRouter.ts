import { Router } from "express";
import { CusService } from "@/internal/customers/CusService.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { handlePostEntityRequest } from "../../entities/handlers/handleCreateEntity/handleCreateEntity.js";
import { handleDeleteEntity } from "./handlers/handleDeleteEntity.js";
import { handleGetEntity } from "./handlers/handleGetEntity.js";

export const entityRouter: Router = Router({ mergeParams: true });

// List entityes
entityRouter.get("", (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "listEntities",
		handler: async (req, res) => {
			const customerId = String(req.params.customer_id);
			const { orgId, env } = req;

			const customer = await CusService.getFull({
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
