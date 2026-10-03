/** One consumed batch's records still on their way to the log: held evicts, and queued commands
 *  decided but not yet committed. The batch's offset commits only once every one has landed. */
export type DeferredLogs = {
	/** Where an evict's held record joins the batch. */
	logs: Promise<void>[];
	/** A decided command's commit joins the batch. */
	add(commit: Promise<void>): void;
	/** Resolves once fewer commits are in flight than the bound: decides never run far ahead of the log. */
	waitForRoom(): Promise<void>;
	/** Resolves once every record has landed; rejects with the first that did not. */
	settle(): Promise<void>;
};
