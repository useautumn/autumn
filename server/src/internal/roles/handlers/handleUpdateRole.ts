import { Scopes } from "@autumn/shared";
import { UpdateRoleParamsSchema } from "@autumn/shared/api/roles/apiRole";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateRole } from "../actions/updateRole.js";

export const handleUpdateRole = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: UpdateRoleParamsSchema,
	handler: async (c) => {
		const { name } = c.req.param();
		const role = await updateRole({
			ctx: c.get("ctx"),
			name,
			params: c.req.valid("json"),
		});
		return c.json(role);
	},
});
