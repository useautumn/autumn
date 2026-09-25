import { EntInterval } from "@autumn/shared";
import { UnsupportedCommandError } from "../../../errors.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { WorkerFullSubject } from "../../../models/subject/workerFullSubject.js";
import {
	findCustomerEntitlementBySoonest,
	fullSubjectToUpdateBalanceRows,
} from "../fullSubjectToUpdateBalanceRows.js";
import type { UpdateBalanceCommand } from "../types/updateBalanceCommand.js";

/** Legacy `updateNextResetAtV2`: moves the soonest reset; a lifetime balance never resets. */
export const setNextResetAt = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: UpdateBalanceCommand;
}): RowChange[] => {
	const { nextResetAt } = command;
	if (nextResetAt === undefined) return [];
	const targetRow = findCustomerEntitlementBySoonest({
		customerEntitlements: fullSubjectToUpdateBalanceRows({
			fullSubject,
			command,
			includesCreditSystems: false,
		}),
		column: "next_reset_at",
	});
	if (!targetRow)
		throw new UnsupportedCommandError({ reason: "balance_not_found" });
	if (targetRow.entitlement.interval === EntInterval.Lifetime)
		throw new UnsupportedCommandError({
			reason: "lifetime_balance_has_no_reset",
		});
	if (targetRow.next_reset_at === nextResetAt) return [];
	return [
		{
			table: "customerEntitlements",
			op: "update",
			id: targetRow.id,
			before: { next_reset_at: targetRow.next_reset_at },
			after: { next_reset_at: nextResetAt },
		},
	];
};
