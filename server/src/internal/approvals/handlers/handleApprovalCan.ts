import { ApprovalsCanParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { resolveApprovalCan } from "../can/resolveApprovalCan.js";

/** POST /approvals.can: answers for the caller, so it needs no scope of its own. */
export const handleApprovalCan = createRoute({
	scopes: [Scopes.Public],
	body: ApprovalsCanParamsSchema,
	handler: async (c) => {
		const { action } = c.req.valid("json");
		return c.json(await resolveApprovalCan({ ctx: c.get("ctx"), action }));
	},
});
