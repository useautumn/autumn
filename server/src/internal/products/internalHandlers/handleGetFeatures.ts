import { createRoute } from "@/honoMiddlewares/routeHandler";
import { Scopes } from "@autumn/shared";

/**
 * GET /products/features
 * Used by: vite/src/hooks/queries/useFeaturesQuery.tsx
 */
export const handleGetFeatures = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const { features } = c.get("ctx");
		return c.json({ features });
	},
});
