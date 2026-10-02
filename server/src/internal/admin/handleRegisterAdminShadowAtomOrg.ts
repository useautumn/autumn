import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { registerShadowAtomOrg } from "./shadowAtom/registerShadowAtomOrg.js";

/** Staff-only: puts an org on our shadow Atom for both envs. Its tokens are in this response once, and nowhere else in plain form. */
export const handleRegisterAdminShadowAtomOrg = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({ org_id: z.string().min(1) }),
	body: z.object({ percent: z.number().int().min(0).max(100).default(100) }),
	handler: async (c) => {
		const { org_id: orgId } = c.req.valid("param");
		const { tokens } = await registerShadowAtomOrg({
			ctx: c.get("ctx"),
			orgId,
			percent: c.req.valid("json").percent,
		});
		return c.json({ org_id: orgId, tokens });
	},
});
