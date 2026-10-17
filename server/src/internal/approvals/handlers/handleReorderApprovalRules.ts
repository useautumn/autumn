import { ReorderApprovalRulesParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { reorderApprovalRules } from "../actions/reorderApprovalRules.js";

/** POST /approval_rules.reorder */
export const handleReorderApprovalRules = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ReorderApprovalRulesParamsSchema,
	handler: async (c) => {
		const { ids } = c.req.valid("json");
		const list = await reorderApprovalRules({ ctx: c.get("ctx"), ids });
		return c.json({ list });
	},
});
