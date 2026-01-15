import {
	FeatureNotFoundError,
	UpdateBalancesParamsSchema,
} from "@autumn/shared";
import { executePostgresDeduction } from "@/internal/balances/utils/deduction/executePostgresDeduction";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import type { FeatureDeduction } from "../../balances/utils/types/featureDeduction";
import { CusService } from "../CusService";

export const handleUpdateBalancesV2 = createRoute({
	body: UpdateBalancesParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");

		const { org, env, db, features } = ctx;
		const { customer_id } = c.req.param();
		const { balances, entity_id } = c.req.valid("json");

		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
			entityId: entity_id,
		});

		for (const balance of balances) {
			const feature = features.find((f) => f.id === balance.feature_id);
			if (!feature) {
				throw new FeatureNotFoundError({ featureId: balance.feature_id });
			}
		}

		const featureDeductions = balances.map((b) => ({
			feature: features.find((f) => f.id === b.feature_id)!,
			deduction: 0,
			targetBalance: b.balance,
		})) satisfies FeatureDeduction[];

		await executePostgresDeduction({
			ctx,
			fullCustomer: fullCus,
			customerId: customer_id,
			deductions: featureDeductions,
			refreshCache: true,
			options: {
				alterGrantedBalance: true,
				overageBehaviour: "allow",
			},
		});

		return c.json({ success: true });
	},
});
