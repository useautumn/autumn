import { Scopes, StandardCursor } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CustomerListFiltersSchema } from "../customerListFilters";
import { CusBatchService } from "../CusBatchService";

export const handleGetFullCustomers = createRoute({
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

		return c.json({ fullCustomers, next_cursor });
	},
});
