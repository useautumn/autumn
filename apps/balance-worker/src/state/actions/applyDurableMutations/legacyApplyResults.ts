import type {
	DurableMutationApplyResult,
	DurableStateInitializationApplyResult,
	DurableTrackOutcomeApplyResult,
} from "../../types/durableMutation.js";

export const trackOutcomeApplyResultOf = ({
	result,
}: {
	result: DurableMutationApplyResult;
}): DurableTrackOutcomeApplyResult => {
	if (result.kind === "position_already_applied") {
		return { kind: result.kind, nextOffset: result.nextOffset };
	}
	if (result.type !== "track_outcome") {
		throw new Error("Expected a durable track outcome result");
	}
	return {
		kind: result.kind,
		state: result.state,
		receipt: result.receipt,
		nextOffset: result.nextOffset,
	};
};

export const stateInitializationApplyResultOf = ({
	result,
}: {
	result: DurableMutationApplyResult;
}): DurableStateInitializationApplyResult => {
	if (result.kind === "position_already_applied") {
		return { kind: result.kind, nextOffset: result.nextOffset };
	}
	if (result.type !== "state_initialized") {
		throw new Error("Expected a durable state initialization result");
	}
	return {
		kind: result.kind,
		state: result.state,
		nextOffset: result.nextOffset,
	};
};
