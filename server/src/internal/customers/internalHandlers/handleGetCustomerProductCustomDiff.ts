import { CusProductNotFoundError, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { customDiffToChanges } from "@/internal/customers/cusProducts/actions/deriveIsCustom/customDiffToChanges";
import { deriveStoredCustomerProductIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/deriveStoredCustomerProductIsCustom";
import { loadFullCustomerProductsWithLicenses } from "@/internal/customers/cusProducts/actions/deriveIsCustom/rederiveIsCustomForCustomers";
import { CusService } from "../CusService";

/** The derived is_custom result for one customer product, for the dashboard's custom badge. */
export const handleGetCustomerProductCustomDiff = createRoute({
	scopes: [Scopes.Customers.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id, customer_product_id } = c.req.param();

		// Loaded by id: the customer's product list is paged and status-filtered, and so are its licenses.
		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customer_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const [customerProduct] = customer
			? await loadFullCustomerProductsWithLicenses({
					ctx,
					customerProductIds: [customer_product_id],
				})
			: [];
		if (
			!customer ||
			!customerProduct ||
			customerProduct.internal_customer_id !== customer.internal_id
		) {
			throw new CusProductNotFoundError({
				customerId: customer_id,
				productId: customer_product_id,
			});
		}

		const result = await deriveStoredCustomerProductIsCustom({
			ctx,
			customerProduct,
			baseProducts: new Map(),
		});

		return c.json({
			is_custom: result.isCustom,
			outcome: result.outcome,
			reasons: result.outcome === "customized" ? result.reasons : [],
			changes:
				result.outcome === "customized"
					? customDiffToChanges({ diff: result.diff })
					: [],
		});
	},
});
