import type {
	CheckCommand,
	CheckDecision,
	MeteringState,
} from "./contracts.js";
import { availableBalanceOf, identitiesMatch } from "./state.js";

export const evaluateCheck = ({
	state,
	command,
}: {
	state: MeteringState;
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

	const feature = state.features[command.featureId];
	if (!feature) {
		return { kind: "unsupported", reason: "feature_not_found" };
	}
	if (feature.buckets.length !== 1) {
		return { kind: "unsupported", reason: "multiple_buckets_not_supported" };
	}

	const balance = availableBalanceOf({ feature });
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
