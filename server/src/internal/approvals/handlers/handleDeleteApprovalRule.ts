import { ApprovalRuleIdParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteApprovalRule } from "../actions/deleteApprovalRule.js";

/** POST /approval_rules.delete */
export const handleDeleteApprovalRule = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ApprovalRuleIdParamsSchema,
	handler: async (c) => {
		const { id } = c.req.valid("json");
		await deleteApprovalRule({ ctx: c.get("ctx"), ruleId: id });
		return c.json({ success: true });
	},
});
