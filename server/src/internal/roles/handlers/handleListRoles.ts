import { Scopes } from "@autumn/shared";
import { ListRolesParamsSchema } from "@autumn/shared/api/roles/apiRole";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listRoles } from "../actions/listRoles.js";

/** POST /roles.list */
export const handleListRoles = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ListRolesParamsSchema,
	handler: async (c) => {
		const list = await listRoles({ ctx: c.get("ctx") });
		return c.json({ list });
	},
});
