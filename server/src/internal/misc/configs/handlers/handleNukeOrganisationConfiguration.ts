import { Scopes } from "@autumn/shared";
import { AppEnv } from "@shared/index";
import { clearOrgWithFeaturesCache } from "@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";
import { FeatureService } from "@/internal/features/FeatureService";
import { ProductService } from "@/internal/products/ProductService";

export const handleNukeOrganisationConfiguration = createRoute({
	scopes: {
		ALL: [
			Scopes.Organisation.Write,
			Scopes.Plans.Write,
			Scopes.Features.Write,
			Scopes.Customers.Write,
		],
	},
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;

		if (env !== AppEnv.Sandbox) {
			return c.json({ error: "Cannot clear non-sandbox orgs" }, 400);
		}

		await CusService.safeDeleteByOrgId({
			db,
			orgId: org.id,
			env: AppEnv.Sandbox,
		});

		await ProductService.safeDeleteByOrgId({
			db,
			orgId: org.id,
			env: AppEnv.Sandbox,
		});
		await FeatureService.safeDeleteByOrgId({
			db,
			orgId: org.id,
			env: AppEnv.Sandbox,
		});

		await invalidateProductsCache({ orgId: org.id, env: AppEnv.Sandbox });
		// Workers read features through the org cache; without this they keep
		// seeing the deleted features for up to the TTL.
		await clearOrgWithFeaturesCache({
			orgId: org.id,
			env: AppEnv.Sandbox,
		});

		return c.json({ message: "Organisation configuration cleared" });
	},
});
