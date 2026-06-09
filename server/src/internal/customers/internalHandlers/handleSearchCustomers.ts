import { type FullCusProduct, Scopes, StandardCursor } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CustomerListFiltersSchema } from "../customerListFilters";
import { CusBatchService } from "../CusBatchService";

export const handleSearchCustomers = createRoute({
	scopes: [Scopes.Customers.Read],
	body: z.object({
		search: z.string().optional(),
		limit: z.number().int().min(1).max(1000).optional().default(50),
		cursor: z.string().optional().default(""),
		filters: CustomerListFiltersSchema.optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { search, limit, cursor, filters } = c.req.valid("json");

		const decoded = StandardCursor.decode(cursor);

		const { fullCustomers, next_cursor } =
			await CusBatchService.getDashboardCursorPage({
				ctx,
				search: search ?? "",
				filters,
				cursor: decoded ? { t: decoded.t, id: decoded.id } : null,
				limit,
			});

		const customers = fullCustomers.map((c) => ({
			internal_id: c.internal_id,
			id: c.id,
			name: c.name,
			email: c.email,
			created_at: c.created_at,
			customer_products: c.customer_products.map((cp: FullCusProduct) => ({
				id: cp.id,
				internal_product_id: cp.internal_product_id,
				product_id: cp.product_id,
				canceled_at: cp.canceled_at,
				status: cp.status,
				trial_ends_at: cp.trial_ends_at,
				created_at: cp.created_at,
				product: cp.product
					? {
							internal_id: cp.product.internal_id,
							id: cp.product.id,
							name: cp.product.name,
							version: cp.product.version,
							is_add_on: cp.product.is_add_on,
						}
					: null,
			})),
		}));

		return c.json({ customers, next_cursor });
	},
});
