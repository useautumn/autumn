import {
	type ApiPlanExpandedV1,
	mapToProductV2,
	productV2ToBasePrice,
	queryInteger,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { buildPlanLicenseChanges } from "@/internal/catalogV2/actions/buildPlanChange/buildPlanLicenseChanges/buildPlanLicenseChanges.js";
import { buildCorePlanUpdatePreview } from "@/internal/product/actions/previewUpdatePlan/buildCorePlanUpdatePreview.js";
import { ProductService } from "../ProductService.js";
import { getPlanResponse } from "../productUtils/productResponseUtils/getPlanResponse.js";
import { buildProductDataCatalogLicenses } from "./buildProductDataCatalogLicenses.js";

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

		// Every row anchored to this version, including historical — the editor picks among them.
		const variantProducts = await ProductService.listVariantsByParent({
			db,
			baseInternalProductIds: [product.internal_id],
			orgId: org.id,
			env,
			returnAll: true,
		});

		const basePlan: ApiPlanExpandedV1 = await getPlanResponse({
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
				const { licenseChanges } = buildPlanLicenseChanges({
					fromLicenses: product.licenses,
					toLicenses: variant.licenses,
					features,
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
					license_changes: licenseChanges,
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
			catalogLicenses: buildProductDataCatalogLicenses({
				product,
				apiLicenses: basePlan.licenses,
				features,
			}),
			variants,
			numVersions: latestProduct.version,
			versionCounts,
		});
	},
});
