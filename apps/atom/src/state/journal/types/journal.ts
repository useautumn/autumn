import type { TrackCommand } from "@autumn/balance-engine";

/** A deduction the Atom granted and owes Autumn: the worker's own track command, with the Atom's bookkeeping beside it. */
export type JournalEntry = {
	/** The customer as the Atom routes it: the command identity's customer id. */
	customerId: string;
	/** Per customer, strictly increasing; never reused, even once older entries are dropped. */
	seq: number;
	/** When the Atom granted it, by the journal's clock. */
	appendedAt: number;
	command: TrackCommand;
};

/** One slot's commands owed to Autumn, written only by the slot's owner thread. */
export type Journal = {
	/** Made once with the file: Autumn counts what it has seen per writer, since seqs count within one file. */
	writerId: string;
	/** In the customer's view from the call on; resolves once its commit is on disk, and rejects if the commit failed. */
	append(params: {
		customerId: string;
		command: TrackCommand;
	}): Promise<JournalEntry>;
	/** What the customer's view replays, oldest first: every entry no push has shown applied. The same array until it changes. */
	owed(params: { customerId: string }): readonly JournalEntry[];
	/** Committed entries Autumn does not hold yet, oldest commit first; each customer's in seq order. */
	unsent(params: { limit: number }): JournalEntry[];
	/** Autumn durably holds these: they stay owed until a push shows them applied. */
	markSent(params: { entries: JournalEntry[] }): void;
	/** Called after every commit. */
	onCommitted(listener: () => void): void;
	/** The customer's send_event goes to the API: it owes too many, its oldest unsent is too old, or its thread holds too many unsent. */
	isBackedUp(params: { customerId: string }): boolean;
	/** After a push is stored: every entry at or below the seq it has seen from this journal's writer leaves the journal. */
	reconcile(params: {
		customerId: string;
		atomSeqs: Record<string, number> | null;
	}): void;
	/** The customer is gone from Autumn: nothing it owes can ever apply. */
	forget(params: { customerId: string }): void;
	close(): void;
};
