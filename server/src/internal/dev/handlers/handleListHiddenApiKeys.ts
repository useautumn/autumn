import { Scopes } from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { apiKeyRepo } from "../repos/index.js";

export const handleListHiddenApiKeys = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const { db, env, org } = c.get("ctx");
		const apiKeys = await apiKeyRepo.listByOrg({
			db,
			orgId: org.id,
			env,
			visibility: "hidden",
		});

		return c.json({ api_keys: apiKeys });
	},
});
