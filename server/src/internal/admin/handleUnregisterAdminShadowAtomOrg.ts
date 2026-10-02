import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { unregisterShadowAtomOrg } from "./shadowAtom/unregisterShadowAtomOrg.js";

export const handleUnregisterAdminShadowAtomOrg = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({ org_id: z.string().min(1) }),
	handler: async (c) => {
		const { org_id: orgId } = c.req.valid("param");
		await unregisterShadowAtomOrg({ orgId });
		return c.json({ org_id: orgId, deleted: true });
	},
});
