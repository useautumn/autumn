import {
	createPaginationParamsSchema,
	ListRefundableChargesResponseSchema,
	PagePaginationDefaults,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getRefundableChargesPage } from "../../refunds/customerRefundUtils.js";

export const handleListRefundableCharges = createRoute({
	params: z.object({
		customer_id: z.string(),
	}),
	query: createPaginationParamsSchema({
		defaultLimit: PagePaginationDefaults.Limit,
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id: customerId } = c.req.param();
		const { offset, limit } = c.req.valid("query");
		const response = await getRefundableChargesPage({
			ctx,
			customerId,
			offset,
			limit,
		});
		return c.json(ListRefundableChargesResponseSchema.parse(response), 200);
	},
});
