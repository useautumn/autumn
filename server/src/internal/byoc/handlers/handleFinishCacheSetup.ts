import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { finishCacheSetup } from "../actions/lifecycle/finishCacheSetup.js";

export const handleFinishCacheSetup = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const ctx = c.get("ctx");
		return c.json(await finishCacheSetup({ ctx }));
	},
});
