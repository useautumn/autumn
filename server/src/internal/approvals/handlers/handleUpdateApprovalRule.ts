import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateApprovalRule } from "../actions/updateApprovalRule.js";
import { invalidApprovalRuleResponse } from "./invalidApprovalRuleResponse.js";

export const handleUpdateApprovalRule = createRoute({
	scopes: [Scopes.Organisation.Write],
	// Malformed JSON reaches here as {}, so an empty PATCH is rejected rather than saved as a no-op.
	body: z
		.record(z.string(), z.unknown())
		.refine((params) => Object.keys(params).length > 0, {
			message: "Send at least one field to update.",
		}),
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
