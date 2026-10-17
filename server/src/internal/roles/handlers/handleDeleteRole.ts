import { Scopes } from "@autumn/shared";
import { RoleIdParamsSchema } from "@autumn/shared/api/roles/apiRole";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteRole } from "../actions/deleteRole.js";

/** POST /roles.delete */
export const handleDeleteRole = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: RoleIdParamsSchema,
	handler: async (c) => {
		const { id } = c.req.valid("json");
		await deleteRole({ ctx: c.get("ctx"), id });
		return c.json({ id });
	},
});
