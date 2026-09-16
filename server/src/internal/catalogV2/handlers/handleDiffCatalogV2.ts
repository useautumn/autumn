import {
	AffectedResource,
	PreviewUpdateCatalogParamsSchema,
	PreviewUpdateCatalogResponseSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { catalogV2Actions } from "@/internal/catalogV2/actions/index.js";
import { buildUpdateCatalogPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/buildUpdateCatalogPreview";

/** Compute a catalog delta without mutation validation or persistence. */
export const handleDiffCatalogV2 = createRoute({
	scopes: { ALL: [Scopes.Plans.Read, Scopes.Features.Read] },
	body: PreviewUpdateCatalogParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		const { catalogContext, updateCatalogPlan } =
			await catalogV2Actions.diffCatalog({ ctx, params });

		return c.json(
			PreviewUpdateCatalogResponseSchema.parse(
				buildUpdateCatalogPreview({ catalogContext, updateCatalogPlan }),
			),
		);
	},
});
