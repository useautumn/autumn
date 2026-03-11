import { mapToProductV2, notNullish, queryNumber } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "../ProductService.js";

const GetProductInternalQuerySchema = z.object({
	version: queryNumber().optional(),
	minorVersion: queryNumber().optional(),
	variant_id: z.string().optional(),
});

export const handleGetProductInternal = createRoute({
	query: GetProductInternalQuerySchema,
	handler: async (c) => {
		let { productId = "" } = c.req.param();
		let [baseProductId, variantId]: [string, string | undefined] = [
			productId,
			undefined,
		];
		const { version, minorVersion, variant_id } = c.req.valid("query");
		const { db, org, env, features } = c.get("ctx");

		// Support variant_id from colon-packed URL or query param
		if (notNullish(productId) && productId.includes(":")) {
			[baseProductId, variantId] = productId.split(":");
			productId = baseProductId;
		} else if (variant_id) {
			variantId = variant_id;
		}

		const [product, latestProduct, variantVersions] = await Promise.all([
			variantId
				? ProductService.getVariant({
						db,
						orgId: org.id,
						env,
						planId: baseProductId,
						variantId: variantId,
						version: version,
						minorVersion: minorVersion,
					})
				: ProductService.getFull({
						db,
						idOrInternalId: baseProductId,
						orgId: org.id,
						env,
						version: version,
					}),
			variantId
				? ProductService.getVariant({
						db,
						orgId: org.id,
						env,
						planId: baseProductId,
						variantId: variantId,
					})
				: ProductService.getFull({
						db,
						idOrInternalId: baseProductId,
						orgId: org.id,
						env,
					}),
			variantId
				? ProductService.listVariantVersions({
						db,
						productId: baseProductId,
						variantId,
						orgId: org.id,
						env,
					})
				: undefined,
		]);

		const productV2 = mapToProductV2({
			product: product,
			features: features,
		});

		return c.json({
			product: productV2,
			numVersions: latestProduct.version,
			...(variantVersions ? { variantVersions } : {}),
		});
	},
});
