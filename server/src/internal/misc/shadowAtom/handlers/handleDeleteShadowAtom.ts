import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteShadowAtom } from "../actions/deleteShadowAtom.js";

/** There is one shadow Atom, so a delete names none; retrying a stopped removal is the same call. */
export const handleDeleteShadowAtom = createRoute({
	scopes: [Scopes.Superuser],
	body: z.object({}),
	handler: async (c) => {
		await deleteShadowAtom({ ctx: c.get("ctx") });
		return c.json({ success: true });
	},
});
