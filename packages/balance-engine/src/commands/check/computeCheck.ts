import type { CustomerState } from "../../models/customerState.js";
import { availableBalanceOf } from "../../utils/customerStateUtils/balanceOf.js";
import { findCustomerEntitlementsForFeature } from "../../utils/customerStateUtils/findCustomerEntitlementsForFeature.js";
import { identitiesMatch } from "../../utils/identityUtils/identitiesMatch.js";
import type { CheckCommand } from "./types/checkCommand.js";
import type { CheckDecision } from "./types/checkDecision.js";

export const computeCheck = ({
	state,
	command,
}: {
	state: CustomerState;
	command: CheckCommand;
}): CheckDecision => {
	if (!identitiesMatch({ left: state.identity, right: command.identity })) {
		return { kind: "unsupported", reason: "subject_mismatch" };
	}
	if (command.entityId) {
		return { kind: "unsupported", reason: "entity_not_supported" };
	}
	if (command.properties && Object.keys(command.properties).length > 0) {
		return { kind: "unsupported", reason: "properties_not_supported" };
	}

	const customerEntitlements = findCustomerEntitlementsForFeature({
		state,
		featureId: command.featureId,
	});
	if (customerEntitlements.length === 0) {
		return { kind: "unsupported", reason: "feature_not_found" };
	}
	if (customerEntitlements.length > 1) {
		return {
			kind: "unsupported",
			reason: "multiple_customer_entitlements_not_supported",
		};
	}

	const balance = availableBalanceOf({ customerEntitlements });
	const allowed =
		command.requiredBalance <= 0 || balance.gte(command.requiredBalance);

	return {
		kind: "decided",
		allowed,
		reason: allowed ? null : "insufficient_balance",
		balance: balance.toNumber(),
		balanceSnapshot: structuredClone(customerEntitlements[0]),
		requiredBalance: command.requiredBalance,
		revision: state.revision,
	};
};
