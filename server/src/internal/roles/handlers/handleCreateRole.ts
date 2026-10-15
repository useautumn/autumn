import { Scopes } from "@autumn/shared";
import { CreateRoleParamsSchema } from "@autumn/shared/api/roles/apiRole";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createRole } from "../actions/createRole.js";

export const handleCreateRole = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: CreateRoleParamsSchema,
	handler: async (c) => {
		const role = await createRole({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		});
		return c.json(role);
	},
});
