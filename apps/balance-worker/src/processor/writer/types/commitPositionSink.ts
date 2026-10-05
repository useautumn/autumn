/**
 * The writer's port for its commit position: each write gets the partition's next sequence number, and the
 * writer reports which of them the log has and which it never will. What reads the position lives outside.
 */
export type CommitPositionSink = {
	/** The last sequence number an earlier writer of the partition issued; each one is committed or failed. */
	open(): { lastSeq: number };
	/** The partition's next sequence number; never one an earlier writer handed out. */
	nextSeq(): number;
	/** Every write up to `seq` is in the log. */
	committed(params: { seq: number }): void;
	/** Nothing in (`seq`, `lastSeq`] reached the log, or ever will. */
	failedAbove(params: { seq: number; lastSeq: number; cause: unknown }): void;
	/** The writer is gone; anything it reports after this is ignored. */
	closed(): void;
};
