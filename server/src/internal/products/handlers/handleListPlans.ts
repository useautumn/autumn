import {
	AffectedResource,
	type ApiPlan,
	applyResponseVersionChanges,
	ListPlansQuerySchema,
} from "@autumn/shared";
import { queryWithCache } from "@/utils/cacheUtils/queryWithCache";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { CusService } from "../../customers/CusService";
import { ProductService } from "../ProductService";
import {
	buildProductsCacheKey,
	PRODUCTS_CACHE_TTL,
} from "../productCacheUtils";
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

		// Build cache key with query params that affect the product list
		// Note: customer_id and entity_id don't affect the product list itself,
		// only the response transformation, so they're not included in cache key
		const productsCacheKey = buildProductsCacheKey({
			orgId: org.id,
			env,
			queryParams: { include_archived },
		});

		const [products, customer] = await Promise.all([
			queryWithCache({
				key: productsCacheKey,
				ttl: PRODUCTS_CACHE_TTL,
				fn: async () => {
					const prods = await ProductService.listFull({
						db,
						orgId: org.id,
						env,
						archived: include_archived ? undefined : false,
					});
					sortFullProducts({ products: prods });
					return prods;
				},
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
			return applyResponseVersionChanges<ApiPlan>({
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
