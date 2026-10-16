import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApprovalRule } from "../actions/getApprovalRule.js";

export const handleGetApprovalRule = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { id } = c.req.param();
		return c.json(await getApprovalRule({ ctx: c.get("ctx"), ruleId: id }));
	},
});
