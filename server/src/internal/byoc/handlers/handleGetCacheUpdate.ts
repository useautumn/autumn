import { GetAtomUpdateParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCacheUpdate } from "../actions/lifecycle/getCacheUpdate.js";

export const handleGetCacheUpdate = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: GetAtomUpdateParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { atom_id } = c.req.valid("json");
		return c.json(await getCacheUpdate({ ctx, atomId: atom_id }));
	},
});
