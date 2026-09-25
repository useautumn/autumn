import {
	cusEntsToBalance,
	type RecalculateBalanceParamsV0,
	type RecalculateBalancePreview,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import {
	recalculateResultToPreview,
	runBalanceWorkerRecalculateBalance,
} from "./balanceWorker/runBalanceWorkerRecalculateBalance.js";
import { computeRecalculateBalance } from "./computeRecalculateBalance";

/**
 * Computes a preview of a balance recalculation without persisting anything,
 * returning the remaining balance per entitlement before and after.
 */
export const recalculateBalancePreview = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: RecalculateBalanceParamsV0;
}): Promise<RecalculateBalancePreview> => {
	if (isBalanceWorkerRolloutEnabled())
		return recalculateResultToPreview({
			result: await runBalanceWorkerRecalculateBalance({
				ctx,
				params,
				preview: true,
			}),
		});
	const { before, after, entityId, totalUsage } =
		await computeRecalculateBalance({ ctx, params });
	const afterById = new Map(after.map((cusEnt) => [cusEnt.id, cusEnt]));
	const entitlements = before.map((cusEnt) => {
		const updated = afterById.get(cusEnt.id) ?? cusEnt;
		return {
			customer_entitlement_id: cusEnt.id,
			before_remaining: cusEntsToBalance({
				cusEnts: [cusEnt],
				entityId,
				withRollovers: true,
			}),
			after_remaining: cusEntsToBalance({
				cusEnts: [updated],
				entityId,
				withRollovers: true,
			}),
		};
	});
	return { total_usage: totalUsage, entitlements };
};
