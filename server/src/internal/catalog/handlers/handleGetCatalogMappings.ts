import {
	AffectedResource,
	CatalogGetMappingsParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCatalogMappings } from "../actions/catalogMappings/getCatalogMappings.js";

export const handleGetCatalogMappings = createRoute({
	scopes: [Scopes.Plans.Read],
	body: CatalogGetMappingsParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const response = await getCatalogMappings({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		});

		return c.json(response);
	},
});
