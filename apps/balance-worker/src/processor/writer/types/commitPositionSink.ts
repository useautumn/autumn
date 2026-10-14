export type CommitPositionSink = {
	nextSeq(): number;
	committed(params: { seq: number }): void;
	failedAbove(params: { seq: number; lastSeq: number; cause: unknown }): void;
	closed(): void;
};
