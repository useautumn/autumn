import {
	AffectedResource,
	CatalogUpdateParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { catalogActions } from "@/internal/catalog/actions/index.js";
import { assertCatalogConfigResourceScope } from "../actions/catalogConfigResources.js";

export const handlePreviewUpdateCatalog = createRoute({
	scopes: { ALL: [Scopes.Plans.Read, Scopes.Features.Read] },
	body: CatalogUpdateParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		assertCatalogConfigResourceScope({
			ctx,
			params,
			scope: Scopes.Rewards.Read,
		});
		const response = await catalogActions.previewUpdate({
			ctx,
			params,
		});
		return c.json(response);
	},
});
