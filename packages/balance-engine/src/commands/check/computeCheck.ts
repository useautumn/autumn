import {
	cusEntToBalance,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { identitiesMatch } from "../../utils/identityUtils/identitiesMatch.js";
import { fullCustomerEntitlementToRow } from "../../utils/subjectUtils/convertSubjectUtils.js";
import type { CheckCommand } from "./types/checkCommand.js";
import type { CheckDecision } from "./types/checkDecision.js";

export const computeCheck = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: CheckCommand;
}): CheckDecision => {
	if (
		!identitiesMatch({ left: fullSubject.identity, right: command.identity })
	) {
		return { kind: "unsupported", reason: "subject_mismatch" };
	}
	if (command.identity.entityId && !fullSubject.entity) {
		return { kind: "unsupported", reason: "entity_not_found" };
	}
	if (command.properties && Object.keys(command.properties).length > 0) {
		return { kind: "unsupported", reason: "properties_not_supported" };
	}

	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [command.featureId],
	});
	const [fundingRow] = customerEntitlements;
	if (!fundingRow) {
		return { kind: "unsupported", reason: "feature_not_found" };
	}
	if (customerEntitlements.length > 1) {
		return {
			kind: "unsupported",
			reason: "multiple_customer_entitlements_not_supported",
		};
	}

	// An overdrawn row reads as zero remaining, the same floor a reject-mode track applies.
	const balance = Decimal.max(cusEntToBalance({ cusEnt: fundingRow }), 0);
	const allowed =
		command.requiredBalance <= 0 || balance.gte(command.requiredBalance);

	return {
		kind: "decided",
		allowed,
		reason: allowed ? null : "insufficient_balance",
		balance: balance.toNumber(),
		customerEntitlement: fullCustomerEntitlementToRow({
			customerEntitlement: fundingRow,
		}),
		requiredBalance: command.requiredBalance,
		revision: fullSubject.revision,
	};
};
