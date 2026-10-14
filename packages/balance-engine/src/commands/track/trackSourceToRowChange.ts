import type { CustomerRowChange } from "../../models/mutation/rowChange.js";
import type { WorkerCustomer } from "../../models/subject/rows/workerCustomer.js";
import type { TrackCommand, TrackSource } from "./types/trackCommand.js";

const heldSeqOf = ({
	source: { atomId, writerId },
	customer,
}: {
	source: TrackSource;
	customer: WorkerCustomer;
}): number => customer.atom_seqs?.[atomId]?.[writerId] ?? 0;

/** The command as a track that deducts, records and claims nothing: only its source's seq can still land. */
export const trackOfNothing = ({
	command,
}: {
	command: TrackCommand;
}): TrackCommand => ({
	...command,
	value: 0,
	usageEvent: null,
	enforceOverdueBlock: false,
	lock: undefined,
	idempotency: undefined,
});

/** An Atom resends what it journaled: a seq the customer already holds was applied with it, so the resend deducts nothing. */
export const atomReplayAsNothing = ({
	command,
	customer,
}: {
	command: TrackCommand;
	customer: WorkerCustomer;
}): TrackCommand =>
	command.source &&
	command.source.seq <= heldSeqOf({ source: command.source, customer })
		? trackOfNothing({ command })
		: command;

/** A track an Atom handed in raises its journal's seq on the customer row; null when that seq is already held. */
export const trackSourceToRowChange = ({
	source,
	customer,
}: {
	source: TrackSource;
	customer: WorkerCustomer;
}): CustomerRowChange | null => {
	const { atomId, writerId, seq } = source;
	const atomSeqs = customer.atom_seqs ?? {};
	if (seq <= heldSeqOf({ source, customer })) return null;
	return {
		table: "customer",
		op: "update",
		id: customer.internal_id,
		// Only the worker writes the column and seqs only rise, so the change needs no guard.
		before: {},
		after: {
			atom_seqs: {
				...atomSeqs,
				[atomId]: { ...atomSeqs[atomId], [writerId]: seq },
			},
		},
	};
};
