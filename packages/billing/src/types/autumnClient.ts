import type { TrackItem } from "../actions/pushHourlyMeters/types/trackItem";

export type BatchTrackResult = { accepted: number };

/** What the meters need from Autumn; `createAutumnClient` is the SDK-backed implementation. */
export type AutumnClient = {
	batchTrack: (params: { items: TrackItem[] }) => Promise<BatchTrackResult>;
	getOrCreateCustomer: (params: { id: string; name: string }) => Promise<void>;
};
