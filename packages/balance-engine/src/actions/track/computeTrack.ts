import { Decimal } from "decimal.js";
import { parseTrackOutcome } from "../../common/parsers.js";
import {
	availableBalanceOf,
	balanceOf,
	identitiesMatch,
} from "../../common/state.js";
import {
	type BalanceMutation,
	type CustomerMeteringState,
	type DirectMeteredV1FeatureState,
	type TrackCommand,
	type TrackDecision,
	type TrackOutcome,
	trackCommandFingerprintOf,
} from "../../contracts.js";
import {
	balanceAfterMutations,
	computeDeduction,
} from "../../deduction/computeDeduction.js";

const receiptMatchesCommand = ({
	receipt,
	command,
}: {
	receipt: TrackOutcome;
	command: TrackCommand;
}): boolean =>
	receipt.commandId === command.commandId &&
	receipt.commandFingerprint === trackCommandFingerprintOf({ command });

type TerminalTrackDecision = Exclude<TrackDecision, { kind: "new" }>;

const classifyTrackCommand = ({
	state,
	command,
	existingReceipt,
}: {
	state: CustomerMeteringState;
	command: TrackCommand;
	existingReceipt: TrackOutcome | null;
}): DirectMeteredV1FeatureState | TerminalTrackDecision => {
	if (!identitiesMatch({ left: state.identity, right: command.identity })) {
		return { kind: "unsupported", reason: "subject_mismatch" };
	}

	const receipt = existingReceipt
		? parseTrackOutcome({ input: existingReceipt })
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

	const featureState = Object.hasOwn(state.featureStatesById, command.featureId)
		? state.featureStatesById[command.featureId]
		: undefined;
	if (!featureState) {
		return { kind: "unsupported", reason: "feature_not_found" };
	}
	if (featureState.customerEntitlements.length !== 1) {
		return {
			kind: "unsupported",
			reason: "multiple_customer_entitlements_not_supported",
		};
	}

	return featureState;
};

const buildTrackOutcome = ({
	state,
	command,
	featureState,
	rejected,
	appliedValue,
	mutations,
}: {
	state: CustomerMeteringState;
	command: TrackCommand;
	featureState: DirectMeteredV1FeatureState;
	rejected: boolean;
	appliedValue: Decimal;
	mutations: BalanceMutation[];
}): TrackOutcome => {
	const balanceBefore = balanceOf({ featureState });

	return parseTrackOutcome({
		input: {
			schemaVersion: 1,
			type: "track_outcome",
			commandId: command.commandId,
			commandFingerprint: trackCommandFingerprintOf({ command }),
			requestId: command.requestId,
			identity: command.identity,
			entityId: command.entityId,
			featureId: command.featureId,
			requestedValue: command.value,
			appliedValue: appliedValue.toNumber(),
			overageBehavior: command.overageBehavior,
			properties: command.properties,
			status: rejected ? "rejected" : "applied",
			reason: rejected ? "insufficient_balance" : null,
			balanceBefore,
			balanceAfter: rejected
				? balanceBefore
				: balanceAfterMutations({
						customerEntitlements: featureState.customerEntitlements,
						mutations,
					}),
			revisionBefore: state.revision,
			revisionAfter: state.revision + 1,
			mutations,
			occurredAt: command.occurredAt,
			deduplicationExpiresAt: command.deduplicationExpiresAt,
		},
	});
};

export const computeTrack = ({
	state,
	command,
	existingReceipt = null,
}: {
	state: CustomerMeteringState;
	command: TrackCommand;
	existingReceipt?: TrackOutcome | null;
}): TrackDecision => {
	const classification = classifyTrackCommand({
		state,
		command,
		existingReceipt,
	});
	if (classification.kind !== "direct_metered_v1") return classification;

	const requestedValue = new Decimal(command.value);
	const rejected =
		command.overageBehavior === "reject" &&
		availableBalanceOf({ featureState: classification }).lt(requestedValue);
	const deduction = rejected
		? { appliedValue: new Decimal(0), mutations: [] }
		: computeDeduction({
				customerEntitlements: classification.customerEntitlements,
				value: requestedValue,
				overageBehavior: command.overageBehavior,
			});

	return {
		kind: "new",
		outcome: buildTrackOutcome({
			state,
			command,
			featureState: classification,
			rejected,
			appliedValue: deduction.appliedValue,
			mutations: deduction.mutations,
		}),
	};
};
