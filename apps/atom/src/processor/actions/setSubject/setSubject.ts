import { splitSubjectState } from "@autumn/balance-engine";
import type { StoredSubject } from "../../../state/types/storedSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

/**
 * Stores a subject as its owners hold it: the customer's own rows, and an entity's own rows beside them.
 * So every push refreshes the customer's rows, and no entity keeps a copy of them that could go stale.
 * A stored push then settles what the journal owes; one older than held settles nothing.
 */
export const setSubject = ({
	ctx,
	subject,
}: {
	ctx: SlotProcessorContext;
	subject: StoredSubject;
}): boolean => {
	const { customer, entity } = splitSubjectState({ state: subject.state });
	const parts = entity ? [customer, entity] : [customer];
	const stored = ctx.sqliteStore.setSubjects({
		subjects: parts.map((state) => ({ ...subject, state })),
	});
	// The pushed subject's own part is the last: false when a newer read of it is already held.
	const isStored = stored.at(-1) ?? false;
	if (!isStored) return false;
	const { customerId } = subject.state.identity;
	ctx.journal.reconcile({
		customerId,
		atomSeqs: subject.state.customer.atom_seqs ?? null,
	});
	ctx.openLocks.settle({
		customerId,
		owed: ctx.journal.owed({ customerId }),
		openLockIds: new Set(customer.openLocks.map(({ lock_id }) => lock_id)),
	});
	return true;
};
