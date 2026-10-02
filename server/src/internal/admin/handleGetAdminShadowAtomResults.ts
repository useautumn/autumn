import { AppEnv, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	queryShadowAtomResults,
	SHADOW_ATOM_RESULT_RANGES,
} from "@/internal/misc/shadowAtom/actions/queryShadowAtomResults.js";

/** Match rate and p50/p99 latency per org, from the shadow check's Axiom lines. */
export const handleGetAdminShadowAtomResults = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({ env: z.enum(AppEnv) }),
	query: z.object({ range: z.enum(SHADOW_ATOM_RESULT_RANGES).default("1h") }),
	handler: async (c) => {
		const { env } = c.req.valid("param");
		const { range } = c.req.valid("query");
		return c.json(await queryShadowAtomResults({ env, range }));
	},
});
