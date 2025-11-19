import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import { createOrgResponse } from "../../orgUtils.js";

export const handleGetOrg = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env } = ctx;
		return c.json(createOrgResponse({ org, env }));
	},
});
