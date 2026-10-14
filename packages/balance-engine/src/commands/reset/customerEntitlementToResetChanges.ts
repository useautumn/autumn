import {
	cusEntToStartingBalance,
	customerEntitlementToNextResetAt,
	getResetBalancesUpdate,
	getRolloverUpdates,
	type ResetBalancesUpdate,
} from "@autumn/shared";
import type { RowChange } from "../../models/mutation/rowChange.js";
import type { DueRow } from "../../utils/subjectUtils/fullSubjectToDueRows.js";
import { addRolloversWithinMax } from "../common/addRolloversWithinMax.js";
import type { ResetCommand } from "./types/resetCommand.js";
import type { ResetRow } from "./types/resetResult.js";

export type CustomerEntitlementReset = {
	changes: RowChange[];
	row: ResetRow;
};

const customerEntitlementToRolloverChanges = ({
	row,
	cycleEndedAt,
}: {
	row: DueRow;
	cycleEndedAt: number;
}): RowChange[] =>
	addRolloversWithinMax({
		row,
		newRollovers: getRolloverUpdates({ cusEnt: row, nextResetAt: cycleEndedAt })
			.toInsert,
	});

const promoteDuePool = ({
	row,
	command,
}: {
	row: DueRow;
	command: ResetCommand;
}): { row: DueRow; changes: RowChange[] } => {
	const pool = row.pooled_balance;
	if (!pool || pool.unlimited) return { row, changes: [] };
	const promoted = {
		granted: command.pooledGranted?.[pool.id] ?? pool.granted,
		last_applied_reset_at: command.occurredAt,
	};
	return {
		row: { ...row, pooled_balance: { ...pool, ...promoted } },
		changes: [
			{
				table: "pooledBalances",
				op: "update",
				id: pool.id,
				before: {
					granted: pool.granted,
					last_applied_reset_at: pool.last_applied_reset_at,
				},
				after: promoted,
			},
			{
				table: "pooledContributions",
				op: "promote",
				pooledBalanceId: pool.id,
				dueBy: command.occurredAt,
			},
		],
	};
};

const replacedBalancesOf = ({
	row,
	balances,
}: {
	row: DueRow;
	balances: ResetBalancesUpdate;
}): Partial<DueRow> => {
	const { usage_attribution: _attribution, ...replaced } = balances;
	return Object.fromEntries(
		Object.keys(replaced).map((column) => [
			column,
			row[column as keyof DueRow],
		]),
	);
};

export const customerEntitlementToResetChanges = ({
	row: dueRow,
	command,
}: {
	row: DueRow;
	command: ResetCommand;
}): CustomerEntitlementReset => {
	const { row, changes: poolChanges } = promoteDuePool({
		row: dueRow,
		command,
	});
	const cycleEndedAt = row.next_reset_at;

	const nextResetAt = customerEntitlementToNextResetAt({
		customerEntitlement: row,
		billingCycleAnchor: row.customer_product
			? command.billingCycleAnchors?.[row.customer_product.id]
			: undefined,
		now: command.occurredAt,
	});

	const balances = getResetBalancesUpdate({
		cusEnt: row,
		allowance: cusEntToStartingBalance({ cusEnt: row }),
		persistFreeOverage: command.org.config.persist_free_overage ?? false,
	});

	return {
		changes: [
			...poolChanges,
			{
				table: "customerEntitlements",
				op: "update",
				id: row.id,
				before: {
					next_reset_at: cycleEndedAt,
					...replacedBalancesOf({ row, balances }),
				},
				after: { ...balances, next_reset_at: nextResetAt },
			},
			...customerEntitlementToRolloverChanges({ row, cycleEndedAt }),
		],
		row: {
			customerEntitlementId: row.id,
			featureId: row.entitlement.feature.id,
			cycleEndedAt,
			nextResetAt,
		},
	};
};
