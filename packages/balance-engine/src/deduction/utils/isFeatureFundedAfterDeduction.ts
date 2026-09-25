import type { CommandOrg } from "../../models/command/commandOrg.js";
import { isOverdueBlocked } from "../setup/selectDeductionRows.js";
import type { DeductionOutcome } from "../types/deductionOutcome.js";
import type { DeductionRow } from "../types/deductionRow.js";
import { deductionRowToCurrentBalance } from "./convertDeductionUtils.js";

/** A check honours the org's overdue block where a track does not, so a row the track drew on may be closed to it. */
const isOpenToCheck = ({
	outcome,
	row,
	org,
}: {
	outcome: DeductionOutcome;
	row: DeductionRow;
	org: CommandOrg;
}): boolean => {
	const customerProduct = outcome.context.customerEntitlements.find(
		(customerEntitlement) => customerEntitlement.id === row.id,
	)?.customer_product;
	if (!customerProduct) return true;
	return !isOverdueBlocked({
		customerProduct,
		request: { enforceOverdueBlock: true, org },
	});
};

/**
 * Sufficient, not exact: true only when a check of `value` on the feature would surely pass after this deduction.
 * A usage-window cap, or an unlimited row that let the deduction skip the caps, leaves it to the full check.
 */
export const isFeatureFundedAfterDeduction = ({
	outcome,
	featureId,
	value,
	org,
}: {
	outcome: DeductionOutcome;
	featureId: string;
	value: number;
	org: CommandOrg;
}): boolean => {
	const { context, deltas } = outcome;
	const ownRows = context.rows.filter(
		(row) =>
			row.table === "customerEntitlements" &&
			row.featureId === featureId &&
			isOpenToCheck({ outcome, row, org }),
	);
	if (ownRows.some((row) => row.unlimited)) return true;

	const capsWereSkipped = context.rows.some((row) => row.unlimited);
	if (capsWereSkipped || context.usageWindowLimits.length > 0) return false;

	// The included bucket draws any own row down to zero, and no spend limit reaches it.
	return ownRows.some((row) =>
		deductionRowToCurrentBalance({ row, deltas }).gte(value),
	);
};
