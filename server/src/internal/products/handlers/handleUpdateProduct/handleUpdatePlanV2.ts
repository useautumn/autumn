import {
	AffectedResource,
	apiPlan,
	UpdatePlanParamsV2Schema,
	type UpdateProductV2Params,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";
import { updateProduct } from "../productActions/updateProduct.js";

const hasOwn = (obj: object, key: string): boolean =>
	Object.getOwnPropertyDescriptor(obj, key) !== undefined;

export const handleUpdatePlanV2 = createRoute({
	body: UpdatePlanParamsV2Schema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");

		const { plan_id, new_plan_id, ...planParams } = body;
		const ctx = c.get("ctx");

		const updates: UpdateProductV2Params = {};

		if (new_plan_id) {
			updates.id = new_plan_id;
		}

		const shouldMapPlanParams =
			hasOwn(planParams, "name") ||
			hasOwn(planParams, "description") ||
			hasOwn(planParams, "group") ||
			hasOwn(planParams, "add_on") ||
			hasOwn(planParams, "auto_enable") ||
			hasOwn(planParams, "items") ||
			hasOwn(planParams, "price") ||
			hasOwn(planParams, "free_trial");

		if (shouldMapPlanParams) {
			const mappedUpdates = apiPlan.map.paramsV1ToProductV2({
				ctx,
				params: {
					id: plan_id,
					...planParams,
				},
			}) as UpdateProductV2Params;

			if (hasOwn(planParams, "name")) {
				updates.name = mappedUpdates.name;
			}

			if (hasOwn(planParams, "description")) {
				updates.description = mappedUpdates.description;
			}

			if (hasOwn(planParams, "group")) {
				updates.group = mappedUpdates.group;
			}

			if (hasOwn(planParams, "add_on")) {
				updates.is_add_on = mappedUpdates.is_add_on;
			}

			if (hasOwn(planParams, "auto_enable")) {
				updates.is_default = mappedUpdates.is_default;
			}

			if (hasOwn(planParams, "items")) {
				updates.items = mappedUpdates.items;
			}

			if (hasOwn(planParams, "free_trial")) {
				updates.free_trial = mappedUpdates.free_trial;
			}
		}

		await updateProduct({
			ctx,
			productId: plan_id,
			query: {},
			updates,
		});

		const latestPlanId = new_plan_id || plan_id;
		const [latestFullProduct, features] = await Promise.all([
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: latestPlanId,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
			FeatureService.list({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		]);

		const latestPlan = await getPlanResponse({
			product: latestFullProduct,
			features,
		});

		return c.json(latestPlan);
	},
});
