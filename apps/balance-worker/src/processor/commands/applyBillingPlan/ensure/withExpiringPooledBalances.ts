import type { ApplyBillingPlanCommand } from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";

/** Which pools the plan strips of their last share. Postgres answers, and exactly: plans of a customer run one at a time, each stored before the next. */
export const withExpiringPooledBalances = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
}): Promise<ApplyBillingPlanCommand> => {
	const removals = command.ops.flatMap((op) =>
		op.op === "delete" && op.table === "pooledContributions" ? [op] : [],
	);
	if (removals.length === 0) return command;
	const expiringPooledBalanceIds =
		await scope.ctx.db.listPooledBalancesWithoutOtherContributions({
			pooledBalanceIds: [
				...new Set(removals.map(({ pooledBalanceId }) => pooledBalanceId)),
			],
			removedContributionIds: removals.map(({ id }) => id),
		});
	return { ...command, expiringPooledBalanceIds };
};
