import {
	AffectedResource,
	PreviewUpdateCatalogParamsSchema,
	PreviewUpdateCatalogResponseSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { catalogV2Actions } from "@/internal/catalogV2/actions/index.js";
import { buildUpdateCatalogPlanPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/buildUpdateCatalogPlanPreview";

/** Resolve a proposed catalog change WITHOUT persisting — same params as catalogV2.update. */
export const handlePreviewUpdateCatalogV2 = createRoute({
	scopes: { ALL: [Scopes.Plans.Read, Scopes.Features.Read] },
	body: PreviewUpdateCatalogParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const { catalogContext, updateCatalogPlan } =
			await catalogV2Actions.updateCatalog({
				ctx,
				params,
				preview: true,
			});

		return c.json(
			PreviewUpdateCatalogResponseSchema.parse({
				plans: [],
				features: buildUpdateCatalogPlanPreview({
					catalogContext,
					updateCatalogPlan,
				}),
			}),
		);
	},
});
