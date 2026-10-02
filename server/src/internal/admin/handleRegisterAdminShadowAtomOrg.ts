import { AppEnv, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { registerShadowAtomOrg } from "./shadowAtom/registerShadowAtomOrg.js";

/** Staff-only: puts an org on our shadow Atom. Its token is in this response once, and nowhere else in plain form. */
export const handleRegisterAdminShadowAtomOrg = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({ env: z.enum(AppEnv), org_id: z.string().min(1) }),
	body: z.object({ percent: z.number().int().min(0).max(100).default(100) }),
	handler: async (c) => {
		const { env, org_id: orgId } = c.req.valid("param");
		const { token } = await registerShadowAtomOrg({
			ctx: c.get("ctx"),
			env,
			orgId,
			percent: c.req.valid("json").percent,
		});
		return c.json({ env, org_id: orgId, token });
	},
});
