import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createApprovalRule } from "../actions/createApprovalRule.js";
import { invalidApprovalRuleResponse } from "./invalidApprovalRuleResponse.js";

export const handleCreateApprovalRule = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const result = await createApprovalRule({
			ctx: c.get("ctx"),
			params: await c.req.json(),
		});
		if (!result.ok)
			return invalidApprovalRuleResponse({ c, issues: result.issues });
		return c.json(result.rule);
	},
});
