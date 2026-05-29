import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { getRevenuecatAccessToken } from "../misc/getRevenuecatAccessToken";
import { initRevenuecatCli } from "../misc/initRevenuecatCli";

export const handleGetRevenueCatProjects = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const revenueCatConfig = org.processor_configs?.revenuecat;

		if (!revenueCatConfig) {
			return c.json({ projects: [] }, 404);
		}

		const accessToken = await getRevenuecatAccessToken({ db, org, env });

		if (!accessToken) {
			return c.json({ projects: [] }, 404);
		}

		const rcCli = initRevenuecatCli({ accessToken });
		const projects = await rcCli.listProjects();

		return c.json(projects);
	},
});
