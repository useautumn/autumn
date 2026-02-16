import { AffectedResource, DeleteCustomerParamsSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerActions } from "@/internal/customers/actions/index.js";

const DeleteCustomerQuerySchema = z.object({
	delete_in_stripe: z.boolean().optional().default(false),
});

export const handleDeleteCustomer = createRoute({
	query: DeleteCustomerQuerySchema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();
		const { delete_in_stripe } = c.req.valid("query");

		await customerActions.delete({
			ctx,
			params: {
				customer_id,
				delete_in_stripe,
			},
		});

		return c.json({ success: true });
	},
});

export const handleDeleteCustomerV2 = createRoute({
	body: DeleteCustomerParamsSchema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		await customerActions.delete({
			ctx,
			params,
		});

		return c.json({ success: true });
	},
});
