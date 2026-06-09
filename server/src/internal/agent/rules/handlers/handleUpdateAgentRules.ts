import { PartialAgentRulesSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { agentRulesActions } from "../actions/index.js";

export const handleUpdateAgentRules = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: PartialAgentRulesSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const updates = c.req.valid("json");
		const rules = await agentRulesActions.update({
			ctx,
			updates,
		});

		return c.json(rules);
	},
});
