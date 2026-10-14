import type { AtomSource } from "../../models/command/atomSource.js";
import type { CustomerRowChange } from "../../models/mutation/rowChange.js";
import type { WorkerCustomer } from "../../models/subject/rows/workerCustomer.js";

const heldSeqOf = ({
	source: { atomId, writerId },
	customer,
}: {
	source: AtomSource;
	customer: WorkerCustomer;
}): number => customer.atom_seqs?.[atomId]?.[writerId] ?? 0;

/** An Atom resends what it journaled: a seq the customer already holds was applied, in the same mutation, before. */
export const isAtomReplay = ({
	source,
	customer,
}: {
	source: AtomSource;
	customer: WorkerCustomer;
}): boolean => source.seq <= heldSeqOf({ source, customer });

/** A command an Atom handed in raises its journal's seq on the customer row; null when that seq is already held. */
export const atomSourceToRowChange = ({
	source,
	customer,
}: {
	source: AtomSource;
	customer: WorkerCustomer;
}): CustomerRowChange | null => {
	if (isAtomReplay({ source, customer })) return null;
	const { atomId, writerId, seq } = source;
	const atomSeqs = customer.atom_seqs ?? {};
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
