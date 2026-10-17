import { Scopes } from "@autumn/shared";
import { UpdateRoleParamsSchema } from "@autumn/shared/api/roles/apiRole";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateRole } from "../actions/updateRole.js";

/** POST /roles.update */
export const handleUpdateRole = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: UpdateRoleParamsSchema,
	handler: async (c) => {
		const role = await updateRole({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		});
		return c.json(role);
	},
});
