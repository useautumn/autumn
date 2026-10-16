import {
	FeatureNotFoundError,
	Scopes,
	UpdateBalancesParamsSchema,
} from "@autumn/shared";
import { checkRouteApproval } from "@/internal/approvals/check/checkRouteApproval";
import { updateBalanceParamsToFacts } from "@/internal/approvals/facts/balances/updateBalanceParamsToFacts";
import { buildApprovalCustomerFacts } from "@/internal/approvals/facts/customer/buildApprovalCustomerFacts";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer";
import { executePostgresDeduction } from "@/internal/balances/utils/deduction/executePostgresDeduction";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import type { FeatureDeduction } from "../../balances/utils/types/featureDeduction";
import { CusService } from "../CusService";

export const handleUpdateBalancesV2 = createRoute({
	scopes: [Scopes.Balances.Write],
	body: UpdateBalancesParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");

		const { features } = ctx;
		const { customer_id } = c.req.param();
		const { balances, entity_id } = c.req.valid("json");

		// Target balances become deltas against this read, so the worker's writes must be in Postgres first.
		if (isBalanceWorkerRolloutEnabled({ ctx, customerId: customer_id }))
			await flushBalanceWorkerCustomer({ ctx, customerId: customer_id });
		const fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customer_id,
			entityId: entity_id,
		});

		for (const balance of balances) {
			const feature = features.find((f) => f.id === balance.feature_id);
			if (!feature) {
				throw new FeatureNotFoundError({ featureId: balance.feature_id });
			}
		}

		// Each target balance is a set balance, judged before any of them is written.
		for (const balance of balances) {
			await checkRouteApproval({
				ctx,
				action: "balances.update",
				buildFacts: async () =>
					updateBalanceParamsToFacts({
						customer: await buildApprovalCustomerFacts({
							ctx,
							fullCustomer: fullCus,
						}),
						params: {
							feature_id: balance.feature_id,
							remaining: balance.balance,
						},
					}),
			});
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
			options: {
				alterGrantedBalance: true,
				overageBehaviour: "allow",
			},
		});

		return c.json({ success: true });
	},
});
