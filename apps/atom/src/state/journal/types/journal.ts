import type { TrackCommand } from "@autumn/balance-engine";
import type { StoredSubject } from "../../types/storedSubject.js";

/** Where a command stands with Autumn: not yet sent, sent and awaiting a push that shows it, or refused by Autumn. */
export type JournalStatus =
	| { kind: "pending" }
	| { kind: "sent" }
	| { kind: "rejected"; code: string };

/** A deduction the Atom granted and owes Autumn: the worker's own track command, with the Atom's bookkeeping beside it. */
export type JournalEntry = {
	/** The customer as the Atom routes it: the command identity's customer id. */
	customerId: string;
	/** Per customer, strictly increasing; never reused, even once older entries are dropped. */
	seq: number;
	status: JournalStatus;
	command: TrackCommand;
};

/** One slot's commands owed to Autumn, written only by the slot's owner thread. */
export type Journal = {
	/** In the customer's view from the call on; resolves once its commit is on disk, and rejects if the commit failed. */
	append(params: {
		customerId: string;
		command: TrackCommand;
	}): Promise<JournalEntry>;
	/** What the customer's view replays, oldest first: every entry not refused. The same array until it changes. */
	owed(params: { customerId: string }): readonly JournalEntry[];
	setStatus(params: {
		customerId: string;
		seq: number;
		status: JournalStatus;
	}): void;
	/** After a push is stored: the entries it shows Autumn has applied leave the journal. */
	reconcile(params: { customerId: string; subject: StoredSubject }): void;
	close(): void;
};
