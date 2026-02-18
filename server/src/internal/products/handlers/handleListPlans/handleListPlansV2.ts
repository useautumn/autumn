import {
	AffectedResource,
	type ApiPlanV1,
	applyResponseVersionChanges,
	ListPlanParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

export const handleListPlansV2 = createRoute({
	body: ListPlanParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, features, env, db } = ctx;
		const body = c.req.valid("json");

		const { customer_id, entity_id, include_archived } = body ?? {};

		const startedAt = Date.now();

		const [products, customer] = await Promise.all([
			ProductService.listFull({
				db,
				orgId: org.id,
				env,
				archived: include_archived ? undefined : false,
			}),
			customer_id
				? CusService.getFull({
						db,
						idOrInternalId: customer_id,
						orgId: org.id,
						env,
						entityId: entity_id,
						withEntities: true,
						withSubs: true,
						allowNotFound: true,
					})
				: undefined,
		]);

		const endedAt = Date.now();
		ctx.logger.debug(`[handleListPlans] query took ${endedAt - startedAt}ms`);

		const batchResponse = [];
		for (const p of products) {
			batchResponse.push(
				getPlanResponse({
					product: p,
					features,
					fullCus: customer ? customer : undefined,
					db,
					currency: org.default_currency || undefined,
				}),
			);
		}

		const plansList = await Promise.all(batchResponse);
		const res = plansList.map((p) => {
			return applyResponseVersionChanges<ApiPlanV1>({
				input: p,
				targetVersion: ctx.apiVersion,
				resource: AffectedResource.Product,
				legacyData: {
					features: ctx.features,
				},
				ctx,
			});
		});

		return c.json({ list: res });
	},
});
