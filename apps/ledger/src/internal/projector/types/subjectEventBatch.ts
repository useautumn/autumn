// One partition's worth of records as the transport hands them over: framing
// and JSON already undone, schema validation still to come.
export type SubjectEventRecord = {
	offset: string;
	value: unknown;
};

export type SubjectEventBatch = {
	partition: number;
	records: SubjectEventRecord[];
};
