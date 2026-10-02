import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getAllocationState } from "../actions/getAllocationState.js";

export const handleGetAllocationState = createRoute({
	scopes: [Scopes.Customers.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();
		return c.json(await getAllocationState({ ctx, customerId: customer_id }));
	},
});
