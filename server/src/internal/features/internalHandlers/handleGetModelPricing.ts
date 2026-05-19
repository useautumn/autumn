import { createRoute } from "@/honoMiddlewares/routeHandler";
import { getModelsDevPricing } from "@/internal/features/utils/getModelPricing";
import { Scopes } from "@autumn/shared";

export const handleGetModelPricing = createRoute({
	scopes: [Scopes.Features.Read],
	handler: async (c) => {
		const data = await getModelsDevPricing();
		return c.json(data);
	},
});
