import { DeleteByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteShadowAtom } from "../actions/deleteShadowAtom.js";

/** As an org's delete: none named is the current shadow Atom; `atom_id` retries an earlier one's stopped removal. */
export const handleDeleteShadowAtom = createRoute({
	scopes: [Scopes.Superuser],
	body: DeleteByocCacheParamsSchema,
	handler: async (c) => {
		await deleteShadowAtom({
			ctx: c.get("ctx"),
			atomId: c.req.valid("json").atom_id,
		});
		return c.json({ success: true });
	},
});
