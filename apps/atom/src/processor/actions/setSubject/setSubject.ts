import { splitSubjectState } from "@autumn/balance-engine";
import type { JournalEntry } from "../../../state/journal/types/journal.js";
import {
	isDeletedSubject,
	type StoredSubject,
} from "../../../state/types/storedSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { owedEntityIdOf } from "../readCurrentSubject/replayOwed.js";

/** The entity an entry moved rows of: its own, or for a finalize left to Autumn, the entity of the lock this slot took. */
const movedEntityIdOf = ({
	ctx,
	entry,
}: {
	ctx: SlotProcessorContext;
	entry: JournalEntry;
}): string | null => {
	const { command } = entry;
	if (command.type !== "undecidedFinalize") return owedEntityIdOf(entry);
	return (
		ctx.openLocks.lockOf({
			customerId: command.customerId,
			lockId: command.lockId,
		})?.row.entity_id ?? null
	);
};

/** Each trimmed entry that moved an entity is expected on that entity's copy, which Autumn pushes apart from the customer's. */
const expectTrimmedOnEntities = ({
	ctx,
	customerId,
	trimmed,
}: {
	ctx: SlotProcessorContext;
	customerId: string;
	trimmed: readonly JournalEntry[];
}): void => {
	for (const entry of trimmed) {
		const entityId = movedEntityIdOf({ ctx, entry });
		if (entityId)
			ctx.laggingEntities.expect({
				customerId,
				entityId,
				writerId: entry.writerId,
				seq: entry.seq,
			});
	}
	ctx.laggingEntities.settle({
		customerId,
		copyOf: (entityId) => {
			const row = ctx.sqliteStore.readSubject({ customerId, entityId });
			return row && !isDeletedSubject(row) ? row : null;
		},
	});
};

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
			const { customerId } = subject.state.identity;
			const owedBefore = ctx.journal.owed({ customerId });
			trimmed = ctx.journal.reconcile({
				customerId,
				atomSeqs: subject.state.customer.atom_seqs ?? null,
			});
			const stillOwed = new Set(ctx.journal.owed({ customerId }));
			expectTrimmedOnEntities({
				ctx,
				customerId,
				trimmed: owedBefore.filter((entry) => !stillOwed.has(entry)),
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
