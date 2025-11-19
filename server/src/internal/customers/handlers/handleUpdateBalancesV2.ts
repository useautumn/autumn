import {
	FeatureNotFoundError,
	UpdateBalancesParamsSchema,
} from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import type { FeatureDeduction } from "../../balances/track/trackUtils/getFeatureDeductions";
import { runDeductionTx } from "../../balances/track/trackUtils/runDeductionTx";
import { CusService } from "../CusService";

export const handleUpdateBalancesV2 = createRoute({
	body: UpdateBalancesParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");

		const { org, env, db, features } = ctx;
		const { customer_id } = c.req.param();
		const { balances } = c.req.valid("json");

		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
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

		await runDeductionTx({
			ctx,
			customerId: customer_id,
			deductions: featureDeductions,
			entityId: fullCus.entity?.id,
			skipAdditionalBalance: true,
			alterGrantedBalance: true,
			refreshCache: true,
		});

		return c.json({ success: true });
	},
});
