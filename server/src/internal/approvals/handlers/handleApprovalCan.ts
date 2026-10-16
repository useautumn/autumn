import { ApprovalActionSchema, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { resolveApprovalCan } from "../can/resolveApprovalCan.js";

/** Any member can ask; the answer is about them, so it needs no scope of its own. */
export const handleApprovalCan = createRoute({
	scopes: [Scopes.Public],
	query: z.object({ action: ApprovalActionSchema }),
	handler: async (c) => {
		const { action } = c.req.valid("query");
		return c.json(await resolveApprovalCan({ ctx: c.get("ctx"), action }), 200);
	},
});
