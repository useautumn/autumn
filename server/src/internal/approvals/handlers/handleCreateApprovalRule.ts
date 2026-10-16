import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createApprovalRule } from "../actions/createApprovalRule.js";
import { invalidApprovalRuleResponse } from "./invalidApprovalRuleResponse.js";

export const handleCreateApprovalRule = createRoute({
	scopes: [Scopes.Organisation.Write],
	// Field checks run in the action, so they report as invalid_approval_rule issues.
	body: z.record(z.string(), z.unknown()),
	handler: async (c) => {
		const result = await createApprovalRule({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		});
		if (!result.ok)
			return invalidApprovalRuleResponse({ c, issues: result.issues });
		return c.json(result.rule);
	},
});
