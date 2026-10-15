import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateApprovalRule } from "../actions/updateApprovalRule.js";
import { invalidApprovalRuleResponse } from "./invalidApprovalRuleResponse.js";

export const handleUpdateApprovalRule = createRoute({
	scopes: [Scopes.Organisation.Write],
	// Field checks run on the merged rule, so they report as invalid_approval_rule issues.
	body: z.record(z.string(), z.unknown()),
	handler: async (c) => {
		const { id } = c.req.param();
		const result = await updateApprovalRule({
			ctx: c.get("ctx"),
			ruleId: id,
			params: c.req.valid("json"),
		});
		if (!result.ok)
			return invalidApprovalRuleResponse({ c, issues: result.issues });
		return c.json(result.rule);
	},
});
