import { FeatureNotFoundError, notNullish } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { runDeductionTx } from "../track/trackUtils/runDeductionTx.js";

export const handleUpdateBalance = createRoute({
	body: z
		.object({
			customer_id: z.string(),
			entity_id: z.string().optional(),
			feature_id: z.string(),

			current_balance: z.number().optional(),
			usage: z.number().optional(),

			// Internal
			customer_entitlement_id: z.string().optional(),
		})
		.refine(
			(data) => {
				if (notNullish(data.current_balance) && notNullish(data.usage)) {
					return false;
				}
				return true;
			},
			{
				message: "'balance' and 'usage' cannot both be provided",
			},
		),

	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { features } = ctx;

		const feature = features.find((f) => f.id === body.feature_id);
		if (!feature) {
			throw new FeatureNotFoundError({ featureId: body.feature_id });
		}

		// Update balance using SQL with alter_granted=true
		if (notNullish(body.current_balance)) {
			await runDeductionTx({
				ctx,
				customerId: body.customer_id,
				entityId: body.entity_id,
				deductions: [
					{
						feature,
						deduction: 0,
						targetBalance: body.current_balance,
					},
				],
				skipAdditionalBalance: true,
				alterGrantedBalance: true,
				sortParams: {
					cusEntId: body.customer_entitlement_id,
				},
				refreshCache: true,
			});
		}

		return c.json({ success: true });
	},
});
