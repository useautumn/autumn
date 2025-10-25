import { Router } from "express";
import { CusService } from "@/internal/customers/CusService.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { handlePostEntityRequest } from "../../entities/handlers/handleCreateEntity/handleCreateEntity.js";
import { handleDeleteEntity } from "./handlers/handleDeleteEntity.js";
import { handleGetEntity } from "./handlers/handleGetEntity.js";

export const expressEntityRouter: Router = Router({ mergeParams: true });

// List entityes
expressEntityRouter.get("", (req: any, res: any) =>
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
expressEntityRouter.post("", handlePostEntityRequest);

// 2. Delete entity
expressEntityRouter.delete("/:entity_id", handleDeleteEntity);

// 3. Get entity
expressEntityRouter.get("/:entity_id", handleGetEntity);

// export const entityRouter = new Hono<HonoEnv>();

// entityRouter.get("/:entity_id", ...handleGetEntity);
