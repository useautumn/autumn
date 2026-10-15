import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteApprovalRule } from "../actions/deleteApprovalRule.js";

export const handleDeleteApprovalRule = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const { id } = c.req.param();
		await deleteApprovalRule({ ctx: c.get("ctx"), ruleId: id });
		return c.json({ deleted: true });
	},
});
