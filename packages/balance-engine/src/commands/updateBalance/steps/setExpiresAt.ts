import {
	EntInterval,
	isPaidCustomerEntitlement,
	notNullish,
} from "@autumn/shared";
import { UnsupportedCommandError } from "../../../errors.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { WorkerFullSubject } from "../../../models/subject/workerFullSubject.js";
import {
	findCustomerEntitlementBySoonest,
	fullSubjectToUpdateBalanceRows,
} from "../fullSubjectToUpdateBalanceRows.js";
import type { UpdateBalanceCommand } from "../types/updateBalanceCommand.js";

/** Legacy `updateExpiresAtV2`: sets the soonest expiry; a paid recurring balance lives as long as its billing cycle. */
export const setExpiresAt = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: UpdateBalanceCommand;
}): RowChange[] => {
	const { expiresAt } = command;
	if (expiresAt === undefined) return [];
	const targetRow = findCustomerEntitlementBySoonest({
		customerEntitlements: fullSubjectToUpdateBalanceRows({
			fullSubject,
			command,
			includesCreditSystems: false,
		}),
		column: "expires_at",
	});
	if (!targetRow)
		throw new UnsupportedCommandError({ reason: "balance_not_found" });

	const { interval } = targetRow.entitlement;
	const isRecurring = notNullish(interval) && interval !== EntInterval.Lifetime;
	if (isRecurring && isPaidCustomerEntitlement(targetRow))
		throw new UnsupportedCommandError({
			reason: "paid_recurring_balance_cannot_expire",
		});
	if (targetRow.expires_at === expiresAt) return [];
	return [
		{
			table: "customerEntitlements",
			op: "update",
			id: targetRow.id,
			before: { expires_at: targetRow.expires_at },
			after: { expires_at: expiresAt },
		},
	];
};
