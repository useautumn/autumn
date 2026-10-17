import { ListApprovalRulesParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listApprovalRules } from "../actions/listApprovalRules.js";

/** POST /approval_rules.list */
export const handleListApprovalRules = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ListApprovalRulesParamsSchema,
	handler: async (c) => {
		const list = await listApprovalRules({ ctx: c.get("ctx") });
		return c.json({ list });
	},
});
