import { FeatureType } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { deduct } from "../../deduction/deduct.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import type { DeductionRow } from "../../deduction/types/deductionRow.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { checkCommandToDeductionRequest } from "./checkCommandToDeductionRequest.js";
import type { CheckCommand } from "./types/checkCommand.js";
import type { CheckResult } from "./types/checkResult.js";

/** The row the answer is reported against: the first one drawn, else the first one that could have been. */
const fundingRowOf = ({
	outcome,
}: {
	outcome: DeductionOutcome;
}): DeductionRow | undefined => {
	const rows = [...outcome.context.rows, ...outcome.context.rolloverRows];
	const [firstDelta] = outcome.deltas;
	const drawn = firstDelta
		? rows.find(
				(row) => row.table === firstDelta.table && row.id === firstDelta.id,
			)
		: undefined;
	return drawn ?? outcome.context.rows[0];
};

/** A check is a reject-mode deduction that is never written: allowed iff the deduction would not be refused. */
export const computeCheck = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: CheckCommand;
}): CheckResult => {
	assertCommandSupported({ fullSubject, command });

	const outcome = deduct({
		fullSubject,
		request: checkCommandToDeductionRequest({ command }),
	});
	const [firstEntitlement] = outcome.context.customerEntitlements;
	if (!firstEntitlement && !outcome.context.overdueBlocked) {
		return {
			allowed: false,
			reason: "feature_not_attached",
			requiredBalance: command.requiredBalance,
			fundingFeatureId: null,
			isFlag: false,
		};
	}

	const feature = firstEntitlement?.entitlement.feature;
	if (feature?.type === FeatureType.Boolean) {
		return {
			allowed: true,
			reason: null,
			requiredBalance: command.requiredBalance,
			fundingFeatureId: feature.id,
			isFlag: true,
		};
	}

	const fundingRow = fundingRowOf({ outcome });
	const allowed = !outcome.rejected;
	return {
		allowed,
		reason: allowed ? null : "insufficient_balance",
		requiredBalance: new Decimal(command.requiredBalance)
			.mul(fundingRow?.creditCost ?? 1)
			.toNumber(),
		fundingFeatureId: fundingRow?.featureId ?? feature?.id ?? command.featureId,
		isFlag: false,
	};
};
