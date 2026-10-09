import { DeleteByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteCache } from "../actions/lifecycle/deleteCache.js";

export const handleDeleteCache = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: DeleteByocCacheParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { atom_id } = c.req.valid("json");
		await deleteCache({ ctx, atomId: atom_id });
		return c.json({ success: true });
	},
});
