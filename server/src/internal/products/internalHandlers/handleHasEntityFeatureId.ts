import { createRoute } from "@/honoMiddlewares/routeHandler";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";

/**
 * GET /products/has_entity_feature_id
 * Used by: vite/src/views/products/plan/hooks/useHasEntityFeatureId.ts
 */
export const handleHasEntityFeatureId = createRoute({
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const hasEntityFeatureId = await EntitlementService.hasEntityFeatureId({
			db,
			orgId: org.id,
			env,
		});

		return c.json({ hasEntityFeatureId });
	},
});
