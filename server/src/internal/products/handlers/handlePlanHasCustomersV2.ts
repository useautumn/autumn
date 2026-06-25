import {
	ApiVersion,
	apiPlan,
	mapToProductV2,
	mergeBillingControls,
	ProductNotFoundError,
	type ProductV2,
	productsAreSame,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { ProductService } from "@/internal/products/ProductService";

export const handlePlanHasCustomersV2 = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, features, org, env, apiVersion } = ctx;

		const body = await c.req.json();

		// REST route passes the plan via `/:product_id`; the RPC route
		// (plans.has_customers) passes `plan_id` in the body. Strip the
		// update-only keys so the rest is the proposed plan to compare.
		const { plan_id, new_plan_id, disable_version, version, ...planParams } =
			body ?? {};
		const productId = c.req.param().product_id ?? plan_id;

		if (!productId) {
			throw new ProductNotFoundError({ productId: "" });
		}

		const product = await ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env: env,
		});

		if (!product) {
			throw new ProductNotFoundError({ productId });
		}

		const cusProductsCurVersion =
			await CusProductService.getByInternalProductId({
				db,
				internalProductId: product.internal_id,
			});

		// V2.0+ (CLI): body is CreatePlanParams, convert to ProductV2
		// < V2.0 (Dashboard): body is already ProductV2
		const productV2 = apiVersion.gte(ApiVersion.V2_0)
			? (apiPlan.map.paramsV1ToProductV2({
					ctx,
					params: planParams,
				}) as ProductV2)
			: (body as ProductV2);
		const curProductV2 = mapToProductV2({
			product,
			features,
		});
		const productPatch = Object.fromEntries(
			Object.entries(productV2).filter(([, value]) => value !== undefined),
		) as Partial<ProductV2>;
		const newProductV2: ProductV2 = {
			...curProductV2,
			...productPatch,
			billing_controls: mergeBillingControls(
				curProductV2.billing_controls,
				productV2.billing_controls,
			),
		};

		const { itemsSame, freeTrialsSame, billingControlsSame } = productsAreSame({
			newProductV2,
			curProductV2,
			features,
		});

		const productSame = itemsSame && freeTrialsSame && billingControlsSame;

		return c.json({
			current_version: product.version,
			will_version: !productSame && cusProductsCurVersion.length > 0,
			archived: product.archived,
		});
	},
});
