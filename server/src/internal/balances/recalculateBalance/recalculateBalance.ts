import type { RecalculateBalanceParamsV0 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { runBalanceWorkerRecalculateBalance } from "./balanceWorker/runBalanceWorkerRecalculateBalance.js";
import { computeRecalculateBalance } from "./computeRecalculateBalance";

export const recalculateBalance = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: RecalculateBalanceParamsV0;
}): Promise<void> => {
	if (isBalanceWorkerRolloutEnabled({ ctx, customerId: params.customer_id })) {
		await runBalanceWorkerRecalculateBalance({ ctx, params, preview: false });
		return;
	}
	const { fullCustomer, before, after } = await computeRecalculateBalance({
		ctx,
		params,
	});
	const afterById = new Map(after.map((cusEnt) => [cusEnt.id, cusEnt]));
	await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as typeof ctx.db };
		for (const cusEnt of before) {
			const updated = afterById.get(cusEnt.id);
			if (!updated) {
				continue;
			}
			await CusEntService.update({
				ctx: txCtx,
				id: cusEnt.id,
				updates: {
					balance: updated.balance ?? 0,
					additional_balance: updated.additional_balance ?? 0,
					entities: updated.entities,
					adjustment: updated.adjustment ?? 0,
				},
			});
		}
	});
	await deleteCachedFullCustomer({
		ctx,
		customerId: fullCustomer.id ?? "",
	});
};
