import type { TrackItem } from "../actions/pushHourlyMeters/types/trackItem";

export type BatchTrackResult = { accepted: number };

type CheckFeature = (params: {
	customerId: string;
	featureId: string;
}) => Promise<{ allowed: boolean }>;

export type AutumnClient = {
	batchTrack: (params: { items: TrackItem[] }) => Promise<BatchTrackResult>;
	getOrCreateCustomer: (params: { id: string; name: string }) => Promise<void>;
	check: CheckFeature;
	edge: { check: CheckFeature };
};
