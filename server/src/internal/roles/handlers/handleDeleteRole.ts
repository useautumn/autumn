import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteRole } from "../actions/deleteRole.js";

export const handleDeleteRole = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const { name } = c.req.param();
		await deleteRole({ ctx: c.get("ctx"), name });
		return c.body(null, 204);
	},
});
