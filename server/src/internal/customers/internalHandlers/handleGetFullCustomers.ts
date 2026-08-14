import {
	BasePriceCursor,
	CustomerListFiltersSchema,
	CustomerListSortBySchema,
	Scopes,
	SortOrderSchema,
	StandardCursor,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusBatchService } from "../CusBatchService";

export const handleGetFullCustomers = createRoute({
	scopes: [Scopes.Customers.Read],
	body: z.object({
		search: z.string().optional(),
		limit: z.number().int().min(1).max(1000).optional().default(50),
		cursor: z.string().optional().default(""),
		filters: CustomerListFiltersSchema.optional(),
		sort_by: CustomerListSortBySchema.optional(),
		sort_order: SortOrderSchema.optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { search, limit, cursor, filters, sort_by, sort_order } =
			c.req.valid("json");

		const sortBy = sort_by ?? "created_at";
		const decoded =
			sortBy === "base_price" ? null : StandardCursor.decode(cursor);
		const decodedBasePrice =
			sortBy === "base_price" ? BasePriceCursor.decode(cursor) : null;

		const { fullCustomers, next_cursor } =
			await CusBatchService.getDashboardCursorPage({
				ctx,
				search: search ?? "",
				filters,
				cursor: decoded ? { t: decoded.t, id: decoded.id } : null,
				basePriceCursor: decodedBasePrice
					? { p: decodedBasePrice.p, id: decodedBasePrice.id }
					: null,
				sortBy,
				limit,
				sortOrder: sort_order,
			});

		return c.json({ fullCustomers, next_cursor });
	},
});
