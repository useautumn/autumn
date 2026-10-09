import {
	CusProductNotFoundError,
	CusProductStatus,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { customDiffToChanges } from "@/internal/customers/cusProducts/actions/deriveIsCustom/customDiffToChanges";
import { deriveCustomerProductIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/deriveCustomerProductIsCustom";
import { loadBaseProduct } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct";
import { CusService } from "../CusService";

/** The derived is_custom result for one customer product, for the dashboard's custom badge. */
export const handleGetCustomerProductCustomDiff = createRoute({
	scopes: [Scopes.Customers.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id, customer_product_id } = c.req.param();

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customer_id,
			inStatuses: Object.values(CusProductStatus),
			withEntities: false,
			skipReset: true,
		});
		const customerProduct = fullCustomer.customer_products.find(
			(candidate) => candidate.id === customer_product_id,
		);
		if (!customerProduct) {
			throw new CusProductNotFoundError({
				customerId: customer_id,
				productId: customer_product_id,
			});
		}

		const result = deriveCustomerProductIsCustom({
			ctx,
			customerProduct,
			baseProduct: await loadBaseProduct({
				ctx,
				internalProductId: customerProduct.internal_product_id,
			}),
			features: ctx.features,
		});

		return c.json({
			is_custom: result.isCustom,
			reason: result.reason,
			changes:
				result.reason === "customized"
					? customDiffToChanges({ diff: result.diff })
					: [],
		});
	},
});
