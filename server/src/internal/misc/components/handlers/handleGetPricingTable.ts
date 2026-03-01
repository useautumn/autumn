import type { FullCusProduct, ProductV2 } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { toPricecnProduct } from "@/internal/products/pricecn/pricecnUtils.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { isProductUpgrade } from "@/internal/products/productUtils.js";

const GetPricingTableQuerySchema = z.object({
	customer_id: z.string().optional(),
});

/**
 * Get pricing table with products for display in components
 */
export const handleGetPricingTable = createRoute({
	query: GetPricingTableQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db, features } = ctx;
		const { customer_id: customerId } = c.req.valid("query");

		const [products, customer] = await Promise.all([
			ProductService.listFull({ db, orgId: org.id, env, archived: false }),
			(async () => {
				if (!customerId) {
					return undefined;
				}
				return await CusService.getFull({
					ctx,
					idOrInternalId: customerId,
				});
			})(),
		]);

		// Sort by add ons
		products.sort((a, _b) => {
			return a.is_add_on ? 1 : -1;
		});

		// 1. Sort products by price
		products.sort((a, b) => {
			const isUpgradeA = isProductUpgrade({
				prices1: a.prices,
				prices2: b.prices,
				usageAlwaysUpgrade: false,
			});

			if (isUpgradeA) {
				return -1;
			}
			return 1;
		});

		const batchResponse = [];
		for (const p of products) {
			const prod = await getProductResponse({ product: p, features });
			let curMainProduct: FullCusProduct | undefined;
			let curScheduledProduct: FullCusProduct | undefined;

			if (customer) {
				const res = getExistingCusProducts({
					product: p,
					cusProducts: customer.customer_products,
				});

				curMainProduct = res.curMainProduct;
				curScheduledProduct = res.curScheduledProduct;
			}

			batchResponse.push(
				toPricecnProduct({
					db,
					org,
					product: prod as ProductV2,
					fullProduct: p,
					features,
					curMainProduct,
					curScheduledProduct,
					otherProducts: products.filter((other) => other.id !== p.id),
					fullCus: customer,
				}),
			);
		}

		const pricecnProds = await Promise.all(batchResponse);

		return c.json({
			list: pricecnProds,
		});
	},
});
