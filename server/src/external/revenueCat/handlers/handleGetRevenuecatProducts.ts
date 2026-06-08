import { AppEnv } from "@shared/index";
import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import {
	getRevenuecatAccessToken,
	getRevenuecatProjectId,
} from "../misc/getRevenuecatAccessToken";
import { initRevenuecatCli } from "../misc/initRevenuecatCli";

export const handleGetRevenueCatProducts = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const revenueCatConfig = org.processor_configs?.revenuecat;

		if (!revenueCatConfig) {
			return c.json({ products: [] }, 404);
		}

		const projectId = getRevenuecatProjectId({ revenueCatConfig, env });
		const accessToken = await getRevenuecatAccessToken({ db, org, env });

		if (!projectId || !accessToken) {
			return c.json({ products: [] }, 404);
		}

		const rcCli = initRevenuecatCli({ projectId, accessToken });
		const products = await rcCli.listProducts();

		return c.json(products);
	},
});
