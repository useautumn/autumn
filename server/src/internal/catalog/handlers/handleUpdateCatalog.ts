import {
	AffectedResource,
	CatalogUpdateParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateCatalog } from "../actions/updateCatalog/updateCatalog.js";
import { assertCatalogConfigResourceScope } from "../actions/catalogConfigResources.js";

export const handleUpdateCatalog = createRoute({
	scopes: { ALL: [Scopes.Plans.Write, Scopes.Features.Write] },
	body: CatalogUpdateParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		assertCatalogConfigResourceScope({
			ctx,
			params,
			scope: Scopes.Rewards.Write,
		});
		const response = await updateCatalog({
			ctx,
			params,
		});
		return c.json(response);
	},
});
