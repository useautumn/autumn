export type TrackItem = {
	customerId: string;
	featureId: string;
	value: number;
	timestampMs: number;
	idempotencyKey: string;
	properties: Record<string, string | number>;
};
