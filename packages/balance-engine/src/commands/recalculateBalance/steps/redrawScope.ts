import {
	cusEntToStartingBalance,
	getResetBalancesUpdate,
} from "@autumn/shared";
import { deduct } from "../../../deduction/deduct.js";
import { toBalanceEditRequest } from "../../../deduction/toBalanceEditRequest.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../../models/subject/workerFullSubject.js";
import { fullSubjectWithCustomerEntitlements } from "../../../utils/subjectUtils/convertSubjectUtils.js";
import { rowsToRecalculateUsage } from "../recalculateBalanceUtils.js";
import type { RecalculateBalanceCommand } from "../types/recalculateBalanceCommand.js";

type Row = WorkerFullCustomerEntitlementWithProduct;

/** Legacy `resetCusEntInPlace`: back to its starting balance, adjustment cleared. */
const resetRow = (row: Row): Row => {
	const startingBalance = cusEntToStartingBalance({ cusEnt: row });
	const reset = getResetBalancesUpdate({
		cusEnt: row,
		allowance:
			startingBalance === undefined ? undefined : Math.max(0, startingBalance),
	});
	return "entities" in reset
		? { ...row, entities: reset.entities, adjustment: 0 }
		: {
				...row,
				balance: reset.balance,
				additional_balance: reset.additional_balance,
				adjustment: 0,
			};
};

const resetToRowChange = ({
	row,
	reset,
}: {
	row: Row;
	reset: Row;
}): RowChange => ({
	table: "customerEntitlements",
	op: "update",
	id: row.id,
	before: {
		balance: row.balance,
		additional_balance: row.additional_balance,
		adjustment: row.adjustment,
		entities: row.entities,
	},
	after: {
		balance: reset.balance,
		additional_balance: reset.additional_balance,
		adjustment: reset.adjustment,
		entities: reset.entities,
	},
});

/** One owner's grants: each reset, then the scope's usage drawn back across them in draw order. */
export const redrawScope = ({
	fullSubject,
	command,
	rows,
}: {
	fullSubject: WorkerFullSubject;
	command: RecalculateBalanceCommand;
	rows: Row[];
}): RowChange[] => {
	const entityId = fullSubject.entity?.id ?? undefined;
	const usage = rowsToRecalculateUsage({ rows, entityId });
	const resets = rows.map((row) => ({ row, reset: resetRow(row) }));
	const resetById = new Map(resets.map(({ row, reset }) => [row.id, reset]));
	const { changes: draws } = deduct({
		// The redraw moves main balances only, so the scope's rollovers are set aside.
		fullSubject: fullSubjectWithCustomerEntitlements({
			fullSubject,
			edit: (row) => {
				const reset = resetById.get(row.id);
				return reset ? { ...reset, rollovers: [] } : row;
			},
		}),
		request: toBalanceEditRequest({
			featureId: command.featureId,
			internalFeatureId: command.internalFeatureId,
			value: usage,
			includesCreditSystems: false,
			countsUsageWindows: false,
			customerEntitlementFilters: { cusEntIds: rows.map(({ id }) => id) },
			org: command.org,
			now: command.occurredAt,
		}),
	});
	return [...resets.map(resetToRowChange), ...draws];
};
