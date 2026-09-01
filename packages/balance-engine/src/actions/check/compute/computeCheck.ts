import { availableBalanceOf } from "../../../common/balanceUtils.js";
import { identitiesMatch } from "../../../common/identityUtils.js";
import type { CustomerMeteringState } from "../../../common/types/customerState/customerStateTypes.js";
import type { CheckCommand } from "../types/checkCommand.js";
import type { CheckDecision } from "../types/checkDecision.js";

// Read-only over the latest applied state: a computed-but-not-yet-executed
// track is invisible to checks by design.
export const computeCheck = ({
	state,
	command,
}: {
	state: CustomerMeteringState;
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

	const customerEntitlements =
		state.customerEntitlementsByFeatureId[command.featureId];
	if (!customerEntitlements) {
		return { kind: "unsupported", reason: "feature_not_found" };
	}
	if (customerEntitlements.length !== 1) {
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
		requiredBalance: command.requiredBalance,
		revision: state.revision,
	};
};
