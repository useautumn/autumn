import { ApprovalRuleIdParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApprovalRule } from "../actions/getApprovalRule.js";

/** POST /approval_rules.get */
export const handleGetApprovalRule = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ApprovalRuleIdParamsSchema,
	handler: async (c) => {
		const { id } = c.req.valid("json");
		const rule = await getApprovalRule({ ctx: c.get("ctx"), ruleId: id });
		return c.json(rule);
	},
});
