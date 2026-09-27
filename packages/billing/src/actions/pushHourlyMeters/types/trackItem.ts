/** One usage record for Autumn, keyed so a re-send never double counts. */
export type TrackItem = {
	customerId: string;
	featureId: string;
	value: number;
	/** When the usage happened, epoch ms; Autumn stamps the event with it. */
	timestampMs: number;
	idempotencyKey: string;
	properties: Record<string, string | number>;
};
