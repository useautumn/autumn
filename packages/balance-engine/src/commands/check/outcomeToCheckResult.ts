import { FeatureType, fullSubjectToCustomerEntitlements } from "@autumn/shared";
import type { DeductionDelta } from "../../deduction/types/deductionDelta.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import { fundingRowOf } from "../../deduction/utils/fundingRowOf.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { requiredBalanceInFundingUnits } from "./requiredBalanceInFundingUnits.js";
import type { CheckCommand } from "./types/checkCommand.js";
import type { CheckResult } from "./types/checkResult.js";

export const outcomeToCheckResult = ({
	fullSubject,
	command,
	outcome,
	precedingDeltas = [],
}: {
	fullSubject: WorkerFullSubject;
	command: CheckCommand;
	outcome: DeductionOutcome;
	precedingDeltas?: DeductionDelta[];
}): CheckResult => {
	const [firstEntitlement] = outcome.context.customerEntitlements;
	if (!firstEntitlement && !outcome.context.overdueBlocked) {
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
		requiredBalance: requiredBalanceInFundingUnits({
			context: outcome.context,
			fundingRow,
			requiredBalance: command.requiredBalance,
			precedingDeltas,
		}),
		fundingFeatureId: fundingRow?.featureId ?? feature?.id ?? command.featureId,
		isFlag: false,
	};
};
