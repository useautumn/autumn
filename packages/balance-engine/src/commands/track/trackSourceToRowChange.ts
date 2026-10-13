import type { CustomerRowChange } from "../../models/mutation/rowChange.js";
import type { WorkerCustomer } from "../../models/subject/rows/workerCustomer.js";
import type { TrackSource } from "./types/trackCommand.js";

/** A track an Atom handed in raises its journal's seq on the customer row; null when that seq is already held. */
export const trackSourceToRowChange = ({
	source: { atomId, writerId, seq },
	customer,
}: {
	source: TrackSource;
	customer: WorkerCustomer;
}): CustomerRowChange | null => {
	const atomSeqs = customer.atom_seqs ?? {};
	if (seq <= (atomSeqs[atomId]?.[writerId] ?? 0)) return null;
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
