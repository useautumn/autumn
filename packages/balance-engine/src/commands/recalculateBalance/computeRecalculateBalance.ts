import { cusEntsToBalance } from "@autumn/shared";
import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import type { RowChange } from "../../models/mutation/rowChange.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import { incrementRow } from "../../mutation/incrementRow.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import {
	assertBalanceRowsFound,
	assertBalanceRowsMutable,
} from "../common/balanceRowGuards.js";
import { selectBalanceRows } from "../common/selectBalanceRows.js";
import {
	rowsToRecalculableScopes,
	rowsToRecalculateUsage,
} from "./recalculateBalanceUtils.js";
import { redrawScope } from "./steps/redrawScope.js";
import type { RecalculateBalanceCommand } from "./types/recalculateBalanceCommand.js";
import type { RecalculateBalanceResult } from "./types/recalculateBalanceResult.js";

type Row = WorkerFullCustomerEntitlementWithProduct;

export type RecalculateBalanceDecision = {
	result: RecalculateBalanceResult;
	/** Null when nothing moves: no scope had both an overdrawn grant and one to absorb it. */
	mutation: SubjectStateMutation | null;
};

/** A row as the changes leave it: a reset replaces its balances, the redraw adds onto them. */
const rowAfter = ({
	row,
	changes,
}: {
	row: Row;
	changes: RowChange[];
}): Row => {
	let current = row;
	for (const change of changes) {
		if (change.table !== "customerEntitlements") continue;
		if (change.op === "update" && change.id === row.id)
			current = { ...current, ...change.after };
		if (change.op === "increment" && change.id === row.id)
			current = incrementRow<Row>({ row: current, change });
	}
	return current;
};

/** Legacy `recalculateBalance`: every recalculable owner's grants reset and their usage redrawn, in one mutation. */
export const computeRecalculateBalance = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: RecalculateBalanceCommand;
}): RecalculateBalanceDecision => {
	assertCommandSupported({ fullSubject, command });
	const rows = selectBalanceRows({
		fullSubject,
		featureId: command.featureId,
		customerEntitlementFilters: command.customerEntitlementFilters,
		now: command.occurredAt,
	});
	assertBalanceRowsFound({ customerEntitlements: rows });
	assertBalanceRowsMutable({ customerEntitlements: rows });

	const entityId = fullSubject.entity?.id ?? undefined;

	const changes = rowsToRecalculableScopes({ rows, entityId }).flatMap(
		(scopeRows) => redrawScope({ fullSubject, command, rows: scopeRows }),
	);

	const remainingOf = (row: Row) =>
		cusEntsToBalance({ cusEnts: [row], entityId, withRollovers: true });

	const result: RecalculateBalanceResult = {
		type: "recalculateBalance",
		totalUsage: rowsToRecalculateUsage({ rows, entityId }),
		customerEntitlements: rows.map((row) => ({
			customerEntitlementId: row.id,
			beforeRemaining: remainingOf(row),
			afterRemaining: remainingOf(rowAfter({ row, changes })),
		})),
	};

	if (changes.length === 0) return { result, mutation: null };

	const mutation: SubjectStateMutation = {
		schemaVersion: 1,
		type: "mutation",
		id: command.commandId,
		identity: command.identity,
		subject: fullSubjectToMutationSubject({ fullSubject }),
		revision: {
			before: fullSubject.revision,
			after: fullSubject.revision + 1,
		},
		command,
		changes,
		result,
	};
	return { result, mutation };
};
