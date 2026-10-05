import type { DeferredLogSink } from "../../../processor/types/deferredLogSink.js";

/** One consumed batch's records still on their way to the log: held evicts, and queued commands
 *  decided but not yet committed. The batch's offset commits only once every one has landed. */
export type DeferredLogs = DeferredLogSink & {
	/** Resolves once fewer records are in flight than the bound: decides never run far ahead of the log. */
	waitForRoom(): Promise<void>;
	/** Resolves once every record has landed; rejects with the first that did not. */
	settle(): Promise<void>;
};
