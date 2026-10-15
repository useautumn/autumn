import type { Journal } from "../../state/journal/types/journal.js";
import type { FolderSubjectPulls } from "../../subjectPulls/types/subjectPulls.js";

/** One slot's journal and how its folder reaches Autumn: the token hash it proves itself with, and its pulls. */
export type ForwardedJournal = {
	journal: Journal;
	tokenHash: () => string;
	pulls: FolderSubjectPulls;
};

/** A journal being handed to Autumn; stopped before its journal closes. */
export type Forwarding = { stop(): void };

/** One per thread: hands Autumn what the journals of the slots it owns hold. */
export type JournalForwarder = {
	/** Hands Autumn what the journal holds now, and again after every commit, until stopped. */
	forward(params: ForwardedJournal): Forwarding;
	/** Hands Autumn what a journal no slot appends to any more holds, then calls `retired`. */
	retire(params: ForwardedJournal & { retired: () => void }): Forwarding;
	/** Resolves once Autumn holds everything the journals being handed to it hold, or once `deadlineMs` passes. */
	drainAll(params: { deadlineMs: number }): Promise<void>;
};
