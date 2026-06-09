import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { agentRulesActions } from "../actions/index.js";

const GenerateAgentRulesSchema = z
	.object({
		end_time: z.string().optional(),
		start_time: z.string().optional(),
	})
	.strict();

export const handleGenerateAgentRules = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: GenerateAgentRulesSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const input = c.req.valid("json");
		const rules = await agentRulesActions.generateAndUpdate({
			ctx,
			endTime: input.end_time,
			startTime: input.start_time,
		});

		return c.json(rules);
	},
});
