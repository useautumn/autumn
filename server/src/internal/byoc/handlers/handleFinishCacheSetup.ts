import { FinishByocCacheSetupParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { finishCacheSetup } from "../actions/lifecycle/finishCacheSetup.js";

export const handleFinishCacheSetup = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: FinishByocCacheSetupParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { atom_id } = c.req.valid("json");
		return c.json(await finishCacheSetup({ ctx, atomId: atom_id }));
	},
});
