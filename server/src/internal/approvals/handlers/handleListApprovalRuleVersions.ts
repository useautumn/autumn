import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listApprovalRuleVersions } from "../actions/listApprovalRuleVersions.js";

export const handleListApprovalRuleVersions = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { id } = c.req.param();
		const list = await listApprovalRuleVersions({
			ctx: c.get("ctx"),
			ruleId: id,
		});
		return c.json({ list });
	},
});
