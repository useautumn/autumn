import { AppEnv, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { unregisterShadowAtomOrg } from "./shadowAtom/unregisterShadowAtomOrg.js";

export const handleUnregisterAdminShadowAtomOrg = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({ env: z.enum(AppEnv), org_id: z.string().min(1) }),
	handler: async (c) => {
		const { env, org_id: orgId } = c.req.valid("param");
		await unregisterShadowAtomOrg({ env, orgId });
		return c.json({ env, org_id: orgId, deleted: true });
	},
});
