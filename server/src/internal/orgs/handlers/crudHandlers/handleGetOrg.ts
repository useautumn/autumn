import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import { Scopes } from "@autumn/shared";
import { createOrgResponse } from "../../orgUtils.js";

export const handleGetOrg = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env } = ctx;
		return c.json(createOrgResponse({ org, env }));
	},
});
