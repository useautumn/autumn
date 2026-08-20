import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { agentRulesRepo } from "../repos/index.js";

/**
 * Agent rules are the bot's operating instructions, so every role that can talk
 * to the bot has to be able to read them. `organisation:read` alone locked out
 * `sales` — the one role without that scope. Granting it to `sales` is not the
 * fix: it also gates Stripe, SSO, webhook and sandbox config.
 */
const AGENT_RULES_READ_SCOPES = {
	ANY: [Scopes.Organisation.Read, Scopes.Billing.Read, Scopes.Customers.Read],
} as const;

export const handleGetAgentRules = createRoute({
	scopes: AGENT_RULES_READ_SCOPES,
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
