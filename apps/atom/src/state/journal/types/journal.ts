import type { FinalizeCommand, TrackCommand } from "@autumn/balance-engine";

/** What the journal owes: the worker's track of a deduction granted here, or the finalize of a lock taken here. */
export type JournaledCommand = TrackCommand | FinalizeCommand;

/** A deduction the Atom granted and owes Autumn: the worker's own track command, with the Atom's bookkeeping beside it. */
export type JournalEntry = {
	/** The customer as the Atom routes it: the command identity's customer id. */
	customerId: string;
	/** The journal that minted it: this file's, or another replica's once an entry is handed over with its customer. */
	writerId: string;
	/** Per customer and writer, strictly increasing; never reused, even once older entries are dropped. */
	seq: number;
	/** When the Atom granted it, by the journal's clock. */
	appendedAt: number;
	command: JournaledCommand;
};

/** An owed entry as it crosses to another journal: with whether Autumn already took it, so the receiver sends it or not. */
export type HandedEntry = JournalEntry & { sent: boolean };

/** One slot's commands owed to Autumn, written only by the slot's owner thread. */
export type Journal = {
	/** Made once with the file: Autumn counts what it has seen per writer, since seqs count within one file. */
	writerId: string;
	/** In the customer's view from the call on; resolves once its commit is on disk, and rejects if the commit failed. */
	append(params: {
		customerId: string;
		command: JournaledCommand;
	}): Promise<JournalEntry>;
	/**
	 * What the customer's view replays, oldest first: every entry no push has shown applied. An append grows this very
	 * array; anything else that changes it (a push's trim, a forget, a failed commit) gives a new one.
	 */
	owed(params: { customerId: string }): readonly JournalEntry[];
	/** Committed entries Autumn does not hold yet, oldest commit first; each customer's in seq order. Parked customers' are left out. */
	unsent(params: { limit: number }): JournalEntry[];
	/** Every committed entry Autumn does not hold yet, parked customers' included. */
	countUnsent(): number;
	/**
	 * Autumn refused the customer's oldest unsent entry on its own: the customer's entries wait behind it, so its seqs reach
	 * Autumn in order, until Autumn holds it (or a push or a forget releases it).
	 */
	park(params: { entry: JournalEntry }): void;
	/** Each parked customer's refused entry. */
	parked(): JournalEntry[];
	/** Autumn durably holds these: they stay owed until a push shows them applied. */
	markSent(params: { entries: JournalEntry[] }): void;
	/** Called after every commit. */
	onCommitted(listener: () => void): void;
	/** The customer's send_event goes to the API: it owes too many, its oldest unsent is too old, or its thread holds too many unsent. */
	isBackedUp(params: { customerId: string }): boolean;
	/**
	 * After a push is stored: every entry at or below the seq its customer row holds for that entry's writer leaves the
	 * journal. `atomSeqs` is that row's, by atom id then writer id; a writer id is unique, so any atom id may hold it.
	 * They leave what is owed at once; the promise settles once the file's deletes have committed.
	 */
	reconcile(params: {
		customerId: string;
		atomSeqs: Record<string, Record<string, number>> | null;
	}): Promise<void>;
	/** The customer is gone from Autumn: nothing it owes can ever apply. */
	forget(params: { customerId: string }): Promise<void>;
	/**
	 * Entries another journal minted, handed over with their customer: held and forwarded under their own writer and seq,
	 * so Autumn's per-writer watermark clears them wherever they were sent from. Ones already held are ignored.
	 */
	appendForeign(params: { entries: HandedEntry[] }): Promise<number>;
	/** Every customer owing something, with each committed entry and whether Autumn already holds it: what a handoff carries. */
	handoffs(): Promise<{ customerId: string; entries: HandedEntry[] }[]>;
	/** Entries handed to another journal, which holds them now: gone from this one. */
	dropHandedOff(params: { entries: JournalEntry[] }): Promise<void>;
	close(): void;
	/** Whether the customer's caller key (its claim key) was appended within KEY_ROW_TTL_MS, its commit landed or not. */
	holdsKey(params: { customerId: string; key: string }): boolean;
};
