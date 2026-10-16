import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listRoles } from "../actions/listRoles.js";

export const handleListRoles = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const list = await listRoles({ ctx: c.get("ctx") });
		return c.json({ list });
	},
});
