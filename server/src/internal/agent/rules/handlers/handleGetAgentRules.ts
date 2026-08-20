import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { agentRulesRepo } from "../repos/index.js";

export const handleGetAgentRules = createRoute({
	// plans:read, not organisation:read — every org role holds it (sales lacks
	// organisation:read), and agent rules are billing guidance those roles need.
	scopes: [Scopes.Plans.Read],
	body: z.object({}).strict(),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const rules = await agentRulesRepo.get({
			db: ctx.db,
			orgId: ctx.org.id,
		});

		return c.json({
			...rules,
			org_slug: rules.org_slug ?? ctx.org.slug,
		});
	},
});
