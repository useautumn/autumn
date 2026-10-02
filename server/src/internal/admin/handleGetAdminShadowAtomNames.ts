import { AppEnv, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { findShadowAtomNames } from "@/internal/misc/shadowAtom/actions/findShadowAtomNames.js";

/** Org and customer names for the ids the env's shadow Atom config holds, so the tab never shows bare ids. */
export const handleGetAdminShadowAtomNames = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({ env: z.enum(AppEnv) }),
	handler: async (c) =>
		c.json(
			await findShadowAtomNames({
				db: c.get("ctx").db,
				env: c.req.valid("param").env,
			}),
		),
});
