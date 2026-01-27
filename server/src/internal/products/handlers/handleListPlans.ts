import {
	AffectedResource,
	type ApiPlanV1,
	applyResponseVersionChanges,
	ListPlansQuerySchema,
} from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { CusService } from "../../customers/CusService";
import { ProductService } from "../ProductService";
import { getPlanResponse } from "../productUtils/productResponseUtils/getPlanResponse";
import { sortFullProducts } from "../productUtils/sortProductUtils";

export const handleListPlans = createRoute({
	query: ListPlansQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, features, env, db } = ctx;
		const query = c.req.valid("query");

		const { customer_id, entity_id, include_archived, v1_schema } = query;

		const startedAt = Date.now();
		const [products, customer] = await Promise.all([
			ProductService.listFull({
				db,
				orgId: org.id,
				env,
				archived: include_archived ? undefined : false,
			}),
			(async () => {
				if (!customer_id) {
					return undefined;
				}

				return await CusService.getFull({
					db,
					idOrInternalId: customer_id,
					orgId: org.id,
					env,
					entityId: entity_id,
					withEntities: true,
					withSubs: true,
					allowNotFound: true,
				});
			})(),
		]);

		const endedAt = Date.now();
		ctx.logger.info(`[handleListPlans] query took ${endedAt - startedAt}ms`);

		if (v1_schema) return c.json({ list: products });

		sortFullProducts({ products });

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
				// getProductResponse({
				// 	product: p,
				// 	features,
				// 	currency: org.default_currency || undefined,
				// 	db,
				// 	fullCus: customer ? customer : undefined,
				// }),
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
