import {
	mapToProductV2,
	productV2ToBasePrice,
	queryInteger,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { buildCorePlanUpdatePreview } from "@/internal/product/actions/previewUpdatePlan/buildCorePlanUpdatePreview.js";
import { ProductService } from "../ProductService.js";
import { getPlanResponse } from "../productUtils/productResponseUtils/getPlanResponse.js";

const GetProductInternalQuerySchema = z.object({
	version: queryInteger().optional(),
});

export const handleGetProductInternal = createRoute({
	scopes: [Scopes.Plans.Read],
	query: GetProductInternalQuerySchema,
	handler: async (c) => {
		const { productId } = c.req.param();
		const { version } = c.req.valid("query");
		const { db, org, env, features } = c.get("ctx");

		const [product, latestProduct, versionCounts] = await Promise.all([
			ProductService.getFull({
				db,
				idOrInternalId: productId,
				orgId: org.id,
				env,
				version: version,
			}),
			ProductService.getFull({
				db,
				idOrInternalId: productId,
				orgId: org.id,
				env,
			}),
			CusProdReadService.getCountsPerVersion({
				db,
				productId,
				orgId: org.id,
				env,
			}),
		]);

		const productV2 = mapToProductV2({
			product: product,
			features: features,
		});

		const variantProducts = await ProductService.listVariantsByParent({
			db,
			baseInternalProductIds: [product.internal_id],
			orgId: org.id,
			env,
		});

		const basePlan = await getPlanResponse({
			product,
			features,
		});

		const variants = await Promise.all(
			variantProducts.map(async (variant) => {
				const variantProduct = mapToProductV2({
					product: variant,
					features,
				});
				const variantPlan = await getPlanResponse({
					product: variant,
					features,
				});
				const preview = buildCorePlanUpdatePreview({
					ctx: { expand: [] },
					planId: variant.id,
					current: basePlan,
					preview: variantPlan,
					hasCustomers: false,
					customerCount: 0,
					versionable: false,
				});

				return {
					id: variant.id,
					name: variant.name,
					latest_version: variant.version,
					product: variantProduct,
					items: variantProduct.items,
					customize: preview.customize,
					price_change: preview.price_change,
					item_changes: preview.item_changes,
				};
			}),
		);
		variants.sort((a, b) => {
			const aPrice = productV2ToBasePrice({ product: a.product })?.price ?? 0;
			const bPrice = productV2ToBasePrice({ product: b.product })?.price ?? 0;
			if (aPrice !== bPrice) return aPrice - bPrice;
			return a.name.localeCompare(b.name);
		});

		return c.json({
			product: productV2,
			variants,
			numVersions: latestProduct.version,
			versionCounts,
		});
	},
});
