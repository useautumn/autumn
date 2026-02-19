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
import { updateProduct } from "../../../product/actions/updateProduct.js";

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

		const shouldMapItems =
			planParams.items !== undefined || planParams.price !== undefined;

		const shouldMapPlanParams =
			planParams.name !== undefined ||
			planParams.description !== undefined ||
			planParams.group !== undefined ||
			planParams.add_on !== undefined ||
			planParams.auto_enable !== undefined ||
			shouldMapItems ||
			planParams.free_trial !== undefined;

		if (shouldMapPlanParams) {
			let itemsForMapping = planParams.items;
			let priceForMapping = planParams.price;

			if (
				shouldMapItems &&
				(itemsForMapping === undefined || priceForMapping === undefined)
			) {
				const currentFullProduct = await ProductService.getFull({
					db: ctx.db,
					idOrInternalId: plan_id,
					orgId: ctx.org.id,
					env: ctx.env,
				});

				if (currentFullProduct) {
					const currentPlan = await getPlanResponse({
						product: currentFullProduct,
						features: ctx.features,
					});

					itemsForMapping =
						itemsForMapping ??
						currentPlan.items.map((item) => ({
							feature_id: item.feature_id,
							included: item.included,
							unlimited: item.unlimited,
							reset: item.reset ?? undefined,
							price: item.price
								? {
										amount: item.price.amount,
										tiers: item.price.tiers,
										interval: item.price.interval,
										interval_count: item.price.interval_count,
										billing_units: item.price.billing_units,
										billing_method: item.price.billing_method,
										max_purchase: item.price.max_purchase ?? undefined,
									}
								: undefined,
							rollover: item.rollover
								? {
										max: item.rollover.max ?? undefined,
										expiry_duration_type: item.rollover.expiry_duration_type,
										expiry_duration_length:
											item.rollover.expiry_duration_length,
									}
								: undefined,
						}));
					priceForMapping =
						priceForMapping ??
						(currentPlan.price
							? {
									amount: currentPlan.price.amount,
									interval: currentPlan.price.interval,
									interval_count: currentPlan.price.interval_count,
								}
							: undefined);
				}
			}

			const mappedUpdates = apiPlan.map.paramsV1ToProductV2({
				ctx,
				params: {
					id: plan_id,
					...(planParams.name !== undefined
						? { name: planParams.name }
						: {}),
					...(planParams.description !== undefined
						? { description: planParams.description }
						: {}),
					...(planParams.group !== undefined
						? { group: planParams.group }
						: {}),
					...(planParams.add_on !== undefined
						? { add_on: planParams.add_on }
						: {}),
					...(planParams.auto_enable !== undefined
						? { auto_enable: planParams.auto_enable }
						: {}),
					...(planParams.free_trial !== undefined
						? { free_trial: planParams.free_trial }
						: {}),
					...(shouldMapItems
						? {
								items: itemsForMapping,
								price: priceForMapping,
							}
						: {}),
				},
			});

			if (planParams.name !== undefined) {
				updates.name = mappedUpdates.name;
			}

			if (planParams.description !== undefined) {
				updates.description = mappedUpdates.description;
			}

			if (planParams.group !== undefined) {
				updates.group = mappedUpdates.group;
			}

			if (planParams.add_on !== undefined) {
				updates.is_add_on = mappedUpdates.is_add_on;
			}

			if (planParams.auto_enable !== undefined) {
				updates.is_default = mappedUpdates.is_default;
			}

			if (shouldMapItems) {
				updates.items = mappedUpdates.items;
			}

			if (planParams.free_trial !== undefined) {
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
