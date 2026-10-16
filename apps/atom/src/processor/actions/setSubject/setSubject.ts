import { splitSubjectState } from "@autumn/balance-engine";
import type { StoredSubject } from "../../../state/types/storedSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

/**
 * Stores a subject as its owners hold it: the customer's own rows, and an entity's own rows beside them.
 * So every push refreshes the customer's rows, and no entity keeps a copy of them that could go stale.
 * A stored push then settles what the journal owes, in the turn its rows are held; one older than held settles nothing.
 */
export const setSubject = async ({
	ctx,
	subject,
}: {
	ctx: SlotProcessorContext;
	subject: StoredSubject;
}): Promise<boolean> => {
	const { customer, entity } = splitSubjectState({ state: subject.state });
	const parts = entity ? [customer, entity] : [customer];
	let trimmed: Promise<void> = Promise.resolve();
	const stored = await ctx.sqliteStore.setSubjects({
		subjects: parts.map((state) => ({ ...subject, state })),
		onStored: (stored) => {
			// The pushed subject's own part is the last: false when a newer read of it is already held.
			if (!stored.at(-1)) return;
			const { customerId, entityId } = subject.state.identity;
			trimmed = ctx.journal.reconcile({
				customerId,
				entityId,
				atomSeqs: subject.state.customer.atom_seqs ?? null,
			});
			ctx.openLocks.settle({
				customerId,
				owed: ctx.journal.owed({ customerId }),
				openLockIds: new Set(customer.openLocks.map(({ lock_id }) => lock_id)),
			});
		},
	});
	await trimmed;
	return stored.at(-1) ?? false;
};
