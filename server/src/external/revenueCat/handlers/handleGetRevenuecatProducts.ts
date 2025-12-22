import { AppEnv } from "@shared/index";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { initRevenuecatCli } from "../misc/initRevenuecatCli";

export const handleGetRevenueCatProducts = createRoute({
	handler: async (c) => {
		const { org, env } = c.get("ctx");
		const revenueCatConfig = org.processor_configs?.revenuecat;

		if (!revenueCatConfig) {
			return c.json({ products: [] }, 404);
		}

		const projectId =
			env === AppEnv.Live
				? revenueCatConfig.project_id
				: revenueCatConfig.sandbox_project_id;
		const apiKey =
			env === AppEnv.Live
				? revenueCatConfig.api_key
				: revenueCatConfig.sandbox_api_key;

		if (!projectId || !apiKey) {
			return c.json({ products: [] }, 404);
		}

		const rcCli = initRevenuecatCli({ projectId, apiKey });
		const products = await rcCli.listProducts();

		return c.json(products);
	},
});
