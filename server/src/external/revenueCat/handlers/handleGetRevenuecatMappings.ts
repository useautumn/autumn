import { createRoute } from "@/honoMiddlewares/routeHandler";
import { Scopes } from "@autumn/shared";
import { RCMappingService } from "../misc/RCMappingService";

export const handleGetRCMappings = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const mappings = await RCMappingService.getAll({
			db,
			orgId: org.id,
			env,
		});

		return c.json({ mappings });
	},
});
