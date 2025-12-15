import { createRoute } from "@/honoMiddlewares/routeHandler";
import { RCMappingService } from "../misc/RCMappingService";

export const handleGetRCMappings = createRoute({
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
