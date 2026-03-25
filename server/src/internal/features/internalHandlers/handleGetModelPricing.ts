import { createRoute } from "@/honoMiddlewares/routeHandler";
import { getModelsDevPricing } from "@/internal/features/utils/getModelPricing";

export const handleGetModelPricing = createRoute({
	handler: async (c) => {
		const data = await getModelsDevPricing();
		return c.json(data);
	},
});
