import { CustomerNotFoundError } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { EventService } from "@/internal/api/events/EventService";
import { CusService } from "../CusService";

/**
 * GET /customers/:customer_id/events
 * Used by: vite/src/views/customers/customer/hooks/useCusEventsQuery.tsx
 */
export const handleGetCustomerEvents = createRoute({
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { customer_id } = c.req.param();

		const customer = await CusService.get({
			db,
			orgId: org.id,
			env,
			idOrInternalId: customer_id,
		});

		if (!customer) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		const events = await EventService.getByCustomerId({
			db,
			internalCustomerId: customer.internal_id,
			env,
			orgId: org.id,
		});

		return c.json({ events });
	},
});
