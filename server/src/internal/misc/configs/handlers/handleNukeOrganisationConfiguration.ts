import { AppEnv } from "@shared/index";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";
import { FeatureService } from "@/internal/features/FeatureService";
import { ProductService } from "@/internal/products/ProductService";

export const handleNukeOrganisationConfiguration = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;

		if (env !== AppEnv.Sandbox) {
			return c.json({ error: "Cannot clear non-sandbox orgs" }, 400);
		}

		await CusService.deleteByOrgId({
			db,
			orgId: org.id,
			env: AppEnv.Sandbox,
		});

		await ProductService.deleteByOrgId({
			db,
			orgId: org.id,
			env: AppEnv.Sandbox,
		});
		await FeatureService.deleteByOrgId({
			db,
			orgId: org.id,
			env: AppEnv.Sandbox,
		});

		return c.json({ message: "Organisation configuration cleared" });
	},
});
