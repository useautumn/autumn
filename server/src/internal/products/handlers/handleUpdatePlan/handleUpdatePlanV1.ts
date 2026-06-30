import {
	AffectedResource,
	type ApiPlanV1,
	ApiVersion,
	ApiVersionClass,
	apiPlan,
	applyResponseVersionChanges,
	RecaseError,
	Scopes,
	UpdatePlanParamsV1Schema,
	UpdatePlanQuerySchema,
	UpdateProductQuerySchema,
	type UpdateProductV2Params,
	UpdateProductV2ParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateProduct } from "../../../product/actions/updateProduct.js";
import { PlanService } from "../../PlanService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleUpdatePlanV1 = createRoute({
	scopes: [Scopes.Plans.Write],
	versionedBody: {
		latest: UpdatePlanParamsV1Schema,
		[ApiVersion.V1_Beta]: UpdateProductV2ParamsSchema,
	},
	versionedQuery: {
		latest: UpdatePlanQuerySchema,
		[ApiVersion.V1_Beta]: UpdateProductQuerySchema,
	},
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		const productId = c.req.param("product_id");

		const { db, org, env, features } = ctx;
		const query = c.req.valid("query") || {};
		const { version, upsert, disable_version } = query;

		if (!productId) {
			throw new RecaseError({
				message: "Product ID is required",
			});
		}

		// Convert to ProductV2 format only if client sent V2 Plan format
		// V1.2 clients already send ProductV2, no conversion needed

		const v1_2Body = ctx.apiVersion.gte(new ApiVersionClass(ApiVersion.V2_0))
			? (apiPlan.map.paramsV1ToProductV2({
					ctx,
					params: body,
				}) as UpdateProductV2Params)
			: (body as UpdateProductV2Params);

		await updateProduct({
			ctx,
			productId,
			query: {
				version: version ? Number(version) : undefined,
				upsert,
				disable_version,
			},
			updates: v1_2Body,
		});

		const latestProductId = v1_2Body.id || productId;
		const newFullProduct = await PlanService.getFull({
			db,
			idOrInternalId: latestProductId,
			orgId: org.id,
			env,
			version: disable_version
				? version
					? Number(version)
					: undefined
				: undefined,
		});

		const planResponse = await getPlanResponse({
			product: newFullProduct,
			features,
		});

		const versionedResponse = applyResponseVersionChanges<ApiPlanV1>({
			input: planResponse,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Product,
			legacyData: {
				features: ctx.features,
			},
			ctx,
		});

		return c.json(versionedResponse);
	},
});
