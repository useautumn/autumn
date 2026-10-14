import { createRoute } from "@/honoMiddlewares/routeHandler";
import { Scopes } from "@autumn/shared";

export const handleGetFeatures = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const { features } = c.get("ctx");
		return c.json({ features });
	},
});
