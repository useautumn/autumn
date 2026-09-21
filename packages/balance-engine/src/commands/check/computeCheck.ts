import { FeatureType } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { deduct } from "../../deduction/deduct.js";
import { fundingRowOf } from "../../deduction/utils/fundingRowOf.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { checkCommandToDeductionRequest } from "./checkCommandToDeductionRequest.js";
import type { CheckCommand } from "./types/checkCommand.js";
import type { CheckResult } from "./types/checkResult.js";

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
