export type TopicRecordEnvelope = {
	schemaVersion: 1;
	type: string;
	payload: unknown;
};

export type TopicSchema<TRecord extends { type: string }> = {
	keyOf(params: { record: TRecord }): string;
	parse(params: { key: Buffer | null; value: Buffer | null }): TRecord;
	serialize(params: { record: TRecord }): {
		key: Buffer;
		value: Buffer;
	};
};
