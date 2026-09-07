import type {
	StateInitializedEvent,
	TrackOutcome,
} from "@autumn/balance-engine";

export type MeteringRecord = StateInitializedEvent | TrackOutcome;
