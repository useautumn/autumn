import {
	CusProductStatus,
	CustomerNotFoundError,
	cusProductToProduct,
	productToCusProduct,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { ProductService } from "@/internal/products/ProductService";
import { mapToProductV2 } from "@/internal/products/productV2Utils";
import { CusService } from "../CusService";
import { ACTIVE_STATUSES } from "../cusProducts/CusProductService";

/**
 * GET /customers/:customer_id/product/:product_id
 * Used by: vite/src/views/customers/customer/product/hooks/useCusProductQuery.tsx
 */
export const handleGetCustomerProduct = createRoute({
	query: z.object({
		version: z.string().optional(),
		customer_product_id: z.string().optional(),
		entity_id: z.string().optional(),
	}),
	handler: async (c) => {
		const { db, org, env, features } = c.get("ctx");
		const { customer_id, product_id } = c.req.param();
		const { version, customer_product_id, entity_id } = c.req.valid("query");

		const customer = await CusService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: customer_id,
			withEntities: true,
			entityId: entity_id,
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.PastDue,
				CusProductStatus.Scheduled,
				CusProductStatus.Expired,
			],
		});

		if (!customer) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		const cusProducts = customer.customer_products;
		const entity = customer.entity;

		const cusProduct = productToCusProduct({
			cusProducts,
			productId: product_id,
			internalEntityId: entity?.internal_id,
			version: version ? parseInt(version) : undefined,
			cusProductId: customer_product_id,
			inStatuses: ACTIVE_STATUSES,
		});

		const product = cusProduct
			? cusProductToProduct({ cusProduct })
			: await ProductService.getFull({
					db,
					orgId: org.id,
					env,
					idOrInternalId: product_id,
					version:
						version && Number.isInteger(parseInt(version))
							? parseInt(version)
							: undefined,
				});

		const productV2 = mapToProductV2({ product: product!, features });

		return c.json({
			cusProduct,
			product: productV2,
		});
	},
});
