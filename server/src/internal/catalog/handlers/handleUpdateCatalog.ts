import {
	AffectedResource,
	CatalogUpdateParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateCatalog } from "../actions/updateCatalog/updateCatalog.js";

export const handleUpdateCatalog = createRoute({
	scopes: { ALL: [Scopes.Plans.Write, Scopes.Features.Write] },
	body: CatalogUpdateParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const response = await updateCatalog({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		});
		return c.json(response);
	},
});
