import { AppEnv } from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import { isDeploymentApiKeyMeta } from "../../orgDeploymentUtils.js";
import { createOrgResponse, isStripeConnected } from "../../orgUtils.js";

export const handleGetOrg = createRoute({
	scopes: [],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const response = createOrgResponse({ org, env });

		if (!response.deployed) {
			const [liveProduct, liveFeature, liveApiKeys] = await Promise.all([
				db.query.products.findFirst({
					columns: { internal_id: true },
					where: (products, { and, eq }) =>
						and(eq(products.org_id, org.id), eq(products.env, AppEnv.Live)),
				}),
				db.query.features.findFirst({
					columns: { internal_id: true },
					where: (features, { and, eq }) =>
						and(eq(features.org_id, org.id), eq(features.env, AppEnv.Live)),
				}),
				db.query.apiKeys.findMany({
					columns: { id: true, meta: true },
					where: (apiKeys, { and, eq }) =>
						and(eq(apiKeys.org_id, org.id), eq(apiKeys.env, AppEnv.Live)),
				}),
			]);
			response.deployed =
				!!liveProduct ||
				!!liveFeature ||
				liveApiKeys.some((key) => isDeploymentApiKeyMeta(key.meta)) ||
				isStripeConnected({ org, env: AppEnv.Live });
		}

		return c.json(response);
	},
});
