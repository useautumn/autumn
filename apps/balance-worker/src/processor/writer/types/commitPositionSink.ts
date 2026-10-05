/**
 * The writer's port for its commit position: each write gets the partition's next sequence number, and the
 * writer reports which of them the log has and which it will not confirm. What reads the position lives outside.
 */
export type CommitPositionSink = {
	/** The partition's next sequence number; never one another writer of the partition handed out. */
	nextSeq(): number;
	/** Every write up to `seq` is in the log. */
	committed(params: { seq: number }): void;
	/** This writer will not confirm anything in (`seq`, `lastSeq`]; `cause` says whether it is known to be absent. */
	failedAbove(params: { seq: number; lastSeq: number; cause: unknown }): void;
	/** The writer is gone; anything it reports after this is ignored. */
	closed(): void;
};
