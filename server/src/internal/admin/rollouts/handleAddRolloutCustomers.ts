import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { addRolloutCustomersToWorker } from "@/internal/misc/rollouts/addRolloutCustomersToWorker.js";

export const RolloutCustomersBodySchema = z.object({
	customer_ids: z.array(z.string().trim().min(1)).min(1).max(100),
});

export const handleAddRolloutCustomers = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({
		rollout_id: z.string().min(1),
		org_id: z.string().min(1),
	}),
	body: RolloutCustomersBodySchema,
	handler: async (c) => {
		const { rollout_id: rolloutId, org_id: orgId } = c.req.param();
		const { customer_ids: customerIds } = c.req.valid("json");

		const config = await addRolloutCustomersToWorker({
			ctx: c.get("ctx"),
			rolloutId,
			orgId,
			customerIds,
		});

		return c.json({
			success: true,
			rolloutId,
			orgId,
			customers: config.rollouts[rolloutId]?.customers[orgId] ?? {},
		});
	},
});
