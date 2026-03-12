import {
	AffectedResource,
	apiPlan,
	mapToProductV2,
	productsAreSame,
	UpdateVariantParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { handleVersionVariantMinor } from "@/internal/products/handlers/handleVersionProduct.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { ProductService } from "../../ProductService.js";
import { handleNewProductItems } from "../../product-items/productItemUtils/handleNewProductItems.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleUpdateVariant = createRoute({
	body: UpdateVariantParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");
		const { plan_id, variant_id, ...planParams } = body;
		const ctx = c.get("ctx");

		const variant = await ProductService.getVariant({
			db: ctx.db,
			planId: plan_id,
			variantId: variant_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const curPrices = variant.prices;
		const curEnts = variant.entitlements;

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
		const nextVariantProduct = {
			...mapToProductV2({
				product: variant,
				features: ctx.features,
			}),
			...mapped,
			items: newItems,
		};

		const hasCustomers = await CusProductService.getByInternalProductId({
			db: ctx.db,
			internalProductId: variant.internal_id,
			limit: 1,
		});

		const { itemsSame } = productsAreSame({
			newProductV2: nextVariantProduct,
			curProductV1: variant,
			features: ctx.features,
		});

		if (hasCustomers.length > 0 && !itemsSame) {
			await handleVersionVariantMinor({
				ctx,
				newProductV2: nextVariantProduct,
				latestVariant: variant,
			});

			const versionedVariant = await ProductService.getVariant({
				db: ctx.db,
				planId: plan_id,
				variantId: variant_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});

			return c.json(
				await getPlanResponse({
					product: versionedVariant,
					features: ctx.features,
				}),
			);
		}

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
	},
});
