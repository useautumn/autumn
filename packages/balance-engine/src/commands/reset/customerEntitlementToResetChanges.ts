import {
	clearRolloversOverMax,
	cusEntToStartingBalance,
	customerEntitlementToNextResetAt,
	getResetBalancesUpdate,
	getRolloverUpdates,
	type Rollover,
} from "@autumn/shared";
import type { RowChange } from "../../models/mutation/rowChange.js";
import type { DueRow } from "../../utils/subjectUtils/fullSubjectToDueRows.js";
import type { ResetCommand } from "./types/resetCommand.js";
import type { ResetRow } from "./types/resetResult.js";

/** A row the reset refills: the changes replay applies and the row the result reports. */
export type CustomerEntitlementReset = {
	changes: RowChange[];
	row: ResetRow;
};

/** What is left on the row carries over, then the cap trims the oldest rollovers first; each outcome is its own change. */
const customerEntitlementToRolloverChanges = ({
	row,
	cycleEndedAt,
}: {
	row: DueRow;
	cycleEndedAt: number;
}): RowChange[] => {
	const { inserts, updates, deleteIds } = clearRolloversOverMax({
		cusEnt: row,
		newRollovers: getRolloverUpdates({ cusEnt: row, nextResetAt: cycleEndedAt })
			.toInsert,
	});
	const existingById = new Map(
		row.rollovers.map((rollover) => [rollover.id, rollover]),
	);
	const rolloverToUpdateChange = (rollover: Rollover): RowChange => ({
		table: "rollovers",
		op: "update",
		id: rollover.id,
		before: { balance: existingById.get(rollover.id)?.balance },
		after: { balance: rollover.balance, entities: rollover.entities },
	});
	return [
		...inserts.map(
			(rollover): RowChange => ({
				table: "rollovers",
				op: "insert",
				row: rollover,
			}),
		),
		...updates.map(rolloverToUpdateChange),
		...deleteIds.map(
			(id): RowChange => ({ table: "rollovers", op: "delete", id }),
		),
	];
};

/**
 * Runs for every due row that is a pool's own row. Before the row refills like any other, its pool
 * moves to the new cycle: the grant becomes the sum of its promoted shares (the sender summed it), and
 * the shares take their next value in Postgres by one set-based change. The refill then reads the new
 * grant. An unlimited pool has no grant to move.
 */
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

/** The same refill the server computes, over the worker's row: the shared helpers own every rule. */
export const customerEntitlementToResetChanges = ({
	row: dueRow,
	command,
}: {
	row: DueRow;
	command: ResetCommand;
}): CustomerEntitlementReset => {
	// A pool row refills from its pool's grant, so the pool moves first and the row below sees the new grant.
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
				// The cycle that ended is the guard: a row already moved on refuses a second refill.
				before: { next_reset_at: cycleEndedAt },
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
