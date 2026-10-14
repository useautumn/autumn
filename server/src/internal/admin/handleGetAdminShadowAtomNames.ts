import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { findShadowAtomNames } from "@/internal/misc/shadowAtom/actions/findShadowAtomNames.js";

export const handleGetAdminShadowAtomNames = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) =>
		c.json(await findShadowAtomNames({ db: c.get("ctx").db })),
});
