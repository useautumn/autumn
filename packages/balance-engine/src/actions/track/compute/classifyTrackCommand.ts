import { identitiesMatch } from "../../../common/identityUtils.js";
import type { CustomerMeteringState } from "../../../common/types/customerState/customerStateTypes.js";
import {
	type TrackCommand,
	trackCommandFingerprintOf,
} from "../types/trackCommand.js";
import type { TrackDecision } from "../types/trackDecision.js";
import {
	type TrackOutcome,
	trackOutcomeSchema,
} from "../types/trackOutcome.js";

const receiptMatchesCommand = ({
	receipt,
	command,
}: {
	receipt: TrackOutcome;
	command: TrackCommand;
}): boolean =>
	receipt.commandId === command.commandId &&
	receipt.commandFingerprint === trackCommandFingerprintOf({ command });

// Every way a track command can resolve without new balance math: wrong
// subject, an already-decided command (terminal receipt), or an input outside
// the first direct-meter slice. Returns null when a new outcome is needed.
export const classifyTrackCommand = ({
	state,
	command,
	existingReceipt,
}: {
	state: CustomerMeteringState;
	command: TrackCommand;
	existingReceipt: TrackOutcome | null;
}): TrackDecision | null => {
	if (!identitiesMatch({ left: state.identity, right: command.identity })) {
		return { kind: "unsupported", reason: "subject_mismatch" };
	}

	// A stored receipt is terminal: retries return it verbatim, even if the
	// balance has changed since — and a payload mismatch is a conflict.
	const receipt = existingReceipt
		? trackOutcomeSchema.parse(existingReceipt)
		: null;
	if (receipt) {
		return receiptMatchesCommand({ receipt, command })
			? { kind: "duplicate", outcome: receipt }
			: { kind: "unsupported", reason: "command_conflict" };
	}

	if (command.entityId) {
		return { kind: "unsupported", reason: "entity_not_supported" };
	}
	if (command.properties && Object.keys(command.properties).length > 0) {
		return { kind: "unsupported", reason: "properties_not_supported" };
	}
	if (command.value < 0) {
		return { kind: "unsupported", reason: "refund_not_supported" };
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

	return null;
};
