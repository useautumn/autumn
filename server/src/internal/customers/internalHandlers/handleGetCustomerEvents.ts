import { CustomerNotFoundError } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";
import { getCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer";

const QuerySchema = z.object({
	interval: z.enum(["7d", "30d", "90d"]).optional(),
	limit: z.coerce.number().min(1).max(500).optional(),
});

/**
 * GET /customers/:customer_id/events
 * Used by: vite/src/views/customers/customer/hooks/useCusEventsQuery.tsx
 *
 * Returns raw events from Tinybird using legacy pipe (includes idempotency_key, entity_id)
 */
export const handleGetCustomerEvents = createRoute({
	query: QuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();
		const { interval, limit } = c.req.valid("query");

		const customer = await getCachedFullCustomer({
			ctx,
			customerId: customer_id,
		});

		if (!customer) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		// Use legacy Tinybird pipe (includes idempotency_key, entity_id fields)
		const result = await eventActions._legacyListRawEvents({
			ctx,
			params: {
				customer_id: customer.id ?? "",
				customer,
				interval: interval ?? "30d",
				limit: limit ?? 50,
			},
		});

		return c.json({ events: result.data });
	},
});
