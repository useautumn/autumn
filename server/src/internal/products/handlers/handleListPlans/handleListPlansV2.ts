import {
	AffectedResource,
	type ApiPlanV1,
	applyResponseVersionChanges,
	type FullProduct,
	ListPlanParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { planLicenseRepo } from "@/internal/licenses/repos/index.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

const findBaseFullProduct = ({
	product,
	products,
}: {
	product: FullProduct;
	products: FullProduct[];
}) => {
	if (!product.base_internal_product_id) return undefined;
	return products.find(
		(candidate) => candidate.internal_id === product.base_internal_product_id,
	);
};

export const handleListPlansV2 = createRoute({
	scopes: [Scopes.Plans.Read],
	body: ListPlanParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, features, env, db } = ctx;
		const body = c.req.valid("json");

		const { customer_id, entity_id, include_archived, all_versions } =
			body ?? {};

		const startedAt = Date.now();

		const [products, customer] = await Promise.all([
			ProductService.listFull({
				db,
				orgId: org.id,
				env,
				archived: include_archived ? undefined : false,
				returnAll: all_versions,
			}),
			customer_id
				? CusService.getFull({
						ctx,
						idOrInternalId: customer_id,
						entityId: entity_id,
						withEntities: true,
						withSubs: true,
						allowNotFound: true,
					})
				: undefined,
		]);

		const endedAt = Date.now();
		ctx.logger.debug(`[handleListPlans] query took ${endedAt - startedAt}ms`);

		const licenseLinkRows =
			await planLicenseRepo.listWithLicensePlanIdByParents({
				db,
				parentInternalProductIds: products.map(
					(product) => product.internal_id,
				),
			});
		const licenseLinksByParent = new Map<string, typeof licenseLinkRows>();
		for (const row of licenseLinkRows) {
			const parentId = row.planLicense.parent_internal_product_id;
			const rows = licenseLinksByParent.get(parentId) ?? [];
			rows.push(row);
			licenseLinksByParent.set(parentId, rows);
		}

		const plansList = await Promise.all(
			products.map((product) =>
				getPlanResponse({
					product,
					features,
					fullCus: customer ? customer : undefined,
					ctx,
					currency: org.default_currency || undefined,
					baseFullProduct: findBaseFullProduct({ product, products }),
					resolveBaseFullProduct: false,
					licenseLinks: licenseLinksByParent.get(product.internal_id) ?? [],
				}),
			),
		);

		const res = plansList.map((plan) => {
			return applyResponseVersionChanges<ApiPlanV1>({
				input: plan,
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
