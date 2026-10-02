import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";

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
