import {
	AffectedResource,
	CatalogUpdateMappingsParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateCatalogMappings } from "../actions/catalogMappings/updateCatalogMappings.js";

export const handleUpdateCatalogMappings = createRoute({
	scopes: [Scopes.Plans.Write],
	body: CatalogUpdateMappingsParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const response = await updateCatalogMappings({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		});

		return c.json(response);
	},
});
