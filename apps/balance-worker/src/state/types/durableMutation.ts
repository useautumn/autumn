import type {
	CustomerMeteringState,
	StateInitializedEvent,
	TrackOutcome,
} from "@autumn/balance-engine";
import type { KafkaRecordPosition } from "./kafkaRecordPosition.js";

export type DurableTrackOutcomeRecord = {
	position: KafkaRecordPosition;
	outcome: TrackOutcome;
};

export type DurableStateInitializationRecord = {
	position: KafkaRecordPosition;
	initialization: StateInitializedEvent;
};

export type DurableTrackOutcomeApplyResult =
	| {
			kind: "applied" | "duplicate";
			state: CustomerMeteringState;
			receipt: TrackOutcome;
			nextOffset: bigint;
	  }
	| {
			kind: "position_already_applied";
			nextOffset: bigint;
	  };

export type DurableStateInitializationApplyResult =
	| {
			kind: "initialized" | "duplicate";
			state: CustomerMeteringState;
			nextOffset: bigint;
	  }
	| {
			kind: "position_already_applied";
			nextOffset: bigint;
	  };

export type DurableMutationRecord = {
	position: KafkaRecordPosition;
	mutation: TrackOutcome | StateInitializedEvent;
};

export type AppliedDurableMutation =
	| {
			type: "track_outcome";
			kind: "applied" | "duplicate";
			state: CustomerMeteringState;
			receipt: TrackOutcome;
	  }
	| {
			type: "state_initialized";
			kind: "initialized" | "duplicate";
			state: CustomerMeteringState;
	  };

export type DurableMutationApplyResult =
	| (AppliedDurableMutation & { nextOffset: bigint })
	| { kind: "position_already_applied"; nextOffset: bigint };
