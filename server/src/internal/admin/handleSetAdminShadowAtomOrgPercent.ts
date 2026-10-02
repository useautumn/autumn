import { AppEnv, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { setShadowAtomOrgPercent } from "./shadowAtom/setShadowAtomOrgPercent.js";

export const handleSetAdminShadowAtomOrgPercent = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({ env: z.enum(AppEnv), org_id: z.string().min(1) }),
	body: z.object({ percent: z.number().int().min(0).max(100) }),
	handler: async (c) => {
		const { env, org_id: orgId } = c.req.valid("param");
		const { percent } = c.req.valid("json");
		await setShadowAtomOrgPercent({ env, orgId, percent });
		return c.json({ env, org_id: orgId, percent });
	},
});
