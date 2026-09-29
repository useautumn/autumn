import type { RowChange } from "../../../../models/mutation/rowChange.js";
import type { ApplyBillingPlanCommand } from "../../types/applyBillingPlanCommand.js";
import {
	findPlanRow,
	type PlanRowChangeContext,
	wasDeletedByPlan,
} from "../planRowChangeContext.js";

/** A pool left with no share expires with its row: both stamped `occurredAt`. License pools live by their seats and never expire here. */
export const expiringPooledBalancesToRowChanges = ({
	command,
	context,
}: {
	command: ApplyBillingPlanCommand;
	context: PlanRowChangeContext;
}): RowChange[] =>
	command.expiringPooledBalanceIds.flatMap((poolId): RowChange[] => {
		const pool = findPlanRow({ context, table: "pooledBalances", id: poolId });
		if (
			!pool ||
			pool.customer_license_link_id !== null ||
			wasDeletedByPlan({ context, table: "pooledBalances", id: poolId })
		)
			return [];
		const poolRow = findPlanRow({
			context,
			table: "customerEntitlements",
			id: pool.customer_entitlement_id,
		});
		return [
			{
				table: "pooledBalances",
				op: "update",
				id: pool.id,
				before: { expires_at: pool.expires_at },
				after: { expires_at: command.occurredAt },
			},
			...(poolRow
				? [
						{
							table: "customerEntitlements" as const,
							op: "update" as const,
							id: poolRow.id,
							before: { expires_at: poolRow.expires_at },
							after: { expires_at: command.occurredAt },
						},
					]
				: []),
		];
	});
