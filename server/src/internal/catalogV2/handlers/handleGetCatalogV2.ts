import {
	GetCatalogParamsSchema,
	GetCatalogResponseSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { catalogV2Actions } from "@/internal/catalogV2/actions/index.js";

export const handleGetCatalogV2 = createRoute({
	scopes: {
		ALL: [Scopes.Plans.Read, Scopes.Features.Read, Scopes.Rewards.Read],
	},
	body: GetCatalogParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const catalog = await catalogV2Actions.getCatalog({ ctx, params });

		return c.json(GetCatalogResponseSchema.parse(catalog));
	},
});
