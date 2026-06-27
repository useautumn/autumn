import {
	AffectedResource,
	CatalogUpdateParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { catalogActions } from "@/internal/catalog/actions/index.js";

/**
 * Resolve a proposed catalog change (features + plans) WITHOUT persisting. Per
 * plan returns the resolved ApiPlan + the versioning/migration impact, so a live
 * preview matches what `catalog.update` would apply.
 */
export const handlePreviewUpdateCatalog = createRoute({
	scopes: { ALL: [Scopes.Plans.Read, Scopes.Features.Read] },
	body: CatalogUpdateParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const response = await catalogActions.previewUpdate({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		});
		return c.json(response);
	},
});
