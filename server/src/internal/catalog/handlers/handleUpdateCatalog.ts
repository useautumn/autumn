import {
	AffectedResource,
	CatalogUpdateParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { checkCatalogEditApprovals } from "@/internal/approvals/enforce/checkCatalogEditApprovals.js";
import { assertCatalogConfigResourceScope } from "../actions/catalogConfigResources.js";
import { updateCatalog } from "../actions/updateCatalog/updateCatalog.js";

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
		await checkCatalogEditApprovals({
			ctx,
			planIds: params.plans.flatMap(({ plan_id, new_plan_id }) => [
				plan_id,
				new_plan_id,
			]),
			featureIds: params.features.map(({ feature_id }) => feature_id),
			includeExisting: !params.skip_deletions,
		});
		const response = await updateCatalog({
			ctx,
			params,
		});
		return c.json(response);
	},
});
