import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateApprovalRule } from "../actions/updateApprovalRule.js";

const UpdateBodySchema = z
	.object({ id: z.string().min(1) })
	.catchall(z.unknown())
	.refine((body) => Object.keys(body).length > 1, {
		message: "Send at least one field to change.",
	});

/** POST /approval_rules.update. Loose like create, so field problems come back as `details.issues`. */
export const handleUpdateApprovalRule = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: UpdateBodySchema,
	handler: async (c) => {
		const rule = await updateApprovalRule({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		});
		return c.json(rule);
	},
});
