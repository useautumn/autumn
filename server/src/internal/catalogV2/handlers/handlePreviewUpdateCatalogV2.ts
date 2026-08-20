import {
	AffectedResource,
	PreviewUpdateCatalogParamsSchema,
	PreviewUpdateCatalogResponseSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { catalogV2Actions } from "@/internal/catalogV2/actions/index.js";
import { buildUpdateCatalogPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/buildUpdateCatalogPreview";
import { timeCatalogPhase } from "@/internal/catalogV2/actions/updateCatalog/setup/timeCatalogPhase";

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

		const preview = await timeCatalogPhase({
			ctx,
			phases: {},
			phase: "build_preview",
			run: async () =>
				PreviewUpdateCatalogResponseSchema.parse(
					buildUpdateCatalogPreview({ catalogContext, updateCatalogPlan }),
				),
		});

		return c.json(preview);
	},
});
