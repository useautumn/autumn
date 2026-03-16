import {
	AffectedResource,
	apiPlan,
	UpdatePlanParamsV2Schema,
	type UpdateProductV2Params,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { updateProduct } from "../../../product/actions/updateProduct.js";
import { ProductService } from "../../ProductService.js";
import { handleNewProductItems } from "../../product-items/productItemUtils/handleNewProductItems.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleUpdatePlanV2 = createRoute({
	body: UpdatePlanParamsV2Schema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");
		const { plan_id, variant_id, new_plan_id, ...planParams } = body;
		const ctx = c.get("ctx");

		// Variant update path — skip versioning, Stripe, rewards
		if (variant_id) {
			const variant = await ProductService.getVariant({
				db: ctx.db,
				planId: plan_id,
				variantId: variant_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});

			const curPrices = variant.prices;
			const curEnts = variant.entitlements;

			// Convert V1 params to internal ProductItem[] using the same mapper as
			// the base plan path (items are CreatePlanItemParamsV1 shaped).
			const mapped = apiPlan.map.paramsV1ToProductV2({
				ctx,
				currentFullProduct: variant,
				params: planParams,
			});

			const curItems = mapToProductItems({
				prices: curPrices,
				entitlements: curEnts,
				features: ctx.features,
			});

			const newItems = mapped.items ?? curItems;

			await handleNewProductItems({
				db: ctx.db,
				curPrices,
				curEnts,
				newItems,
				features: ctx.features,
				product: variant,
				logger: ctx.logger,
				isCustom: false,
			});

			const updatedVariant = await ProductService.getVariant({
				db: ctx.db,
				planId: plan_id,
				variantId: variant_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});

			return c.json(
				await getPlanResponse({
					product: updatedVariant,
					features: ctx.features,
				}),
			);
		}

		// Base plan update path
		const initialFullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: plan_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const updateProductV2Params = apiPlan.map.paramsV1ToProductV2({
			ctx,
			currentFullProduct: initialFullProduct,
			params: {
				id: new_plan_id,
				...planParams,
			},
		}) as UpdateProductV2Params;

		await updateProduct({
			ctx,
			productId: plan_id,
			query: {},
			updates: updateProductV2Params,
			initialFullProduct,
		});

		const latestPlanId = new_plan_id || plan_id;
		const latestFullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: latestPlanId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		return c.json(
			await getPlanResponse({
				product: latestFullProduct,
				features: ctx.features,
			}),
		);
	},
});
