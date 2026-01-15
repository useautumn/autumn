import { createRoute } from "@/honoMiddlewares/routeHandler";

/**
 * GET /products/features
 * Used by: vite/src/hooks/queries/useFeaturesQuery.tsx
 */
export const handleGetFeatures = createRoute({
	handler: async (c) => {
		const { features } = c.get("ctx");
		return c.json({ features });
	},
});
