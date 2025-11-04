import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { CusService } from "../../customers/CusService.js";

export const handleListEntities = createRoute({
	handler: async (c) => {
		const { customer_id } = c.req.param();
		const ctx = c.get("ctx");

		const { db, org, env } = ctx;

		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
		});

		return c.json({
			list: fullCus.entities,
		});
	},
});
