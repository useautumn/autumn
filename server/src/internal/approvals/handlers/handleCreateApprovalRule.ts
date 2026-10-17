import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createApprovalRule } from "../actions/createApprovalRule.js";

/**
 * POST /approval_rules.create. The body stays loose so rule-field problems come back as
 * `invalid_approval_rule` with `details.issues`, not `invalid_inputs`.
 */
export const handleCreateApprovalRule = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: z.record(z.string(), z.unknown()),
	handler: async (c) => {
		const rule = await createApprovalRule({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		});
		return c.json(rule);
	},
});
