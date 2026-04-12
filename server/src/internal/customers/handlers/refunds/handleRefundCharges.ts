import {
	CustomerRefundParamsSchema,
	CustomerRefundResponseSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { executeRefunds } from "../../refunds/customerRefundUtils.js";

export const handleRefundCharges = createRoute({
	params: z.object({
		customer_id: z.string(),
	}),
	body: CustomerRefundParamsSchema,
	lock: {
		getKey: (c) => {
			const { customer_id: customerId } = c.req.param();
			return customerId ? `customer_refunds:${customerId}` : null;
		},
		errorMessage: "A refund request is already running for this customer",
		ttlMs: 15_000,
	},
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id: customerId } = c.req.param();
		const body = c.req.valid("json");
		const response = await executeRefunds({
			ctx,
			customerId,
			chargeIds: body.charge_ids,
			mode: body.mode,
			amountsByChargeId: body.amounts_by_charge_id,
			reason: body.reason,
		});
		return c.json(CustomerRefundResponseSchema.parse(response), 200);
	},
});
