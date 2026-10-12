import type { TrackItem } from "../actions/pushHourlyMeters/types/trackItem";

export type BatchTrackResult = { accepted: number };

/** Autumn's own org as billing uses it; `createAutumnClient` is the SDK-backed implementation. */
export type AutumnClient = {
	batchTrack: (params: { items: TrackItem[] }) => Promise<BatchTrackResult>;
	getOrCreateCustomer: (params: { id: string; name: string }) => Promise<void>;
	check: (params: {
		customerId: string;
		featureId: string;
	}) => Promise<{ allowed: boolean }>;
};
