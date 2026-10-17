import { ApprovalRuleIdParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listApprovalRuleVersions } from "../actions/listApprovalRuleVersions.js";

/** POST /approval_rules.versions.list */
export const handleListApprovalRuleVersions = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ApprovalRuleIdParamsSchema,
	handler: async (c) => {
		const { id } = c.req.valid("json");
		const list = await listApprovalRuleVersions({
			ctx: c.get("ctx"),
			ruleId: id,
		});
		return c.json({ list });
	},
});
