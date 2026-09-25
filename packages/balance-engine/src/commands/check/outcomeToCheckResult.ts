import { FeatureType, fullSubjectToCustomerEntitlements } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import { fundingRowOf } from "../../deduction/utils/fundingRowOf.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import type { CheckCommand } from "./types/checkCommand.js";
import type { CheckResult } from "./types/checkResult.js";

/** What a check's dry-run deduction says: allowed iff it was not refused, denominated in the row that funded it. */
export const outcomeToCheckResult = ({
	fullSubject,
	command,
	outcome,
}: {
	fullSubject: WorkerFullSubject;
	command: CheckCommand;
	outcome: DeductionOutcome;
}): CheckResult => {
	const [firstEntitlement] = outcome.context.customerEntitlements;
	if (!firstEntitlement && !outcome.context.overdueBlocked) {
		// Nothing funds the feature, so only a requirement of nothing can be met.
		const allowed = command.requiredBalance <= 0;
		return {
			allowed,
			reason: allowed ? null : "feature_not_attached",
			limitType: null,
			requiredBalance: command.requiredBalance,
			fundingFeatureId: null,
			isFlag: false,
		};
	}

	// An overdue block empties the selection, so the feature is read from everything the subject holds.
	const feature =
		firstEntitlement?.entitlement.feature ??
		fullSubjectToCustomerEntitlements({
			fullSubject,
			featureIds: [command.featureId],
			now: command.occurredAt,
		})[0]?.entitlement.feature;
	if (feature?.type === FeatureType.Boolean) {
		const holdsFlag = firstEntitlement !== undefined;
		return {
			allowed: holdsFlag,
			reason: holdsFlag ? null : "insufficient_balance",
			limitType: null,
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
		limitType: allowed ? null : outcome.limitType,
		requiredBalance: new Decimal(command.requiredBalance)
			.mul(fundingRow?.creditCost ?? 1)
			.toNumber(),
		fundingFeatureId: fundingRow?.featureId ?? feature?.id ?? command.featureId,
		isFlag: false,
	};
};
