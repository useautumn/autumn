import {
	findLockInsertInMutation,
	type WorkerLock,
} from "@autumn/balance-engine";
import type { JournalEntry } from "../../../state/journal/types/journal.js";
import { isDeletedSubject } from "../../../state/types/storedSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import {
	joinedCatalogOf,
	withOwedEntityCopies,
} from "../readCurrentSubject/owedEntityCopies.js";
import { replayOwed } from "../readCurrentSubject/replayOwed.js";

const takesLock = ({ command }: JournalEntry, lockId: string): boolean =>
	command.type === "track" && command.lock?.lockId === lockId;

/** Every row the customer's owed entries insert, replayed from its stored rows as the view replays them. */
const replayLockRows = ({
	ctx,
	customerId,
	owed,
}: {
	ctx: SlotProcessorContext;
	customerId: string;
	owed: readonly JournalEntry[];
}): void => {
	const customer = ctx.sqliteStore.readSubject({ customerId, entityId: null });
	if (!customer || isDeletedSubject(customer)) return;
	const entityCopies = withOwedEntityCopies({
		ctx,
		customerId,
		copies: new Map(),
		owed,
	});
	replayOwed({
		owed,
		parts: { customer: customer.state, entities: new Map() },
		catalog: joinedCatalogOf({
			parts: [customer, ...entityCopies.values()],
			shared: ctx.catalogStore.read(),
		}),
		entityPartOf: (entityId) => entityCopies.get(entityId)?.state ?? null,
		onApplied: (mutation) => {
			const row = findLockInsertInMutation({ mutation });
			const { command: track } = mutation;
			if (row && track.type === "track") ctx.openLocks.hold({ track, row });
		},
	});
};

/** The row of a lock this slot took: held since its track, or after a restart replayed from the journal while still owed. */
export const heldLockRowOf = ({
	ctx,
	customerId,
	lockId,
}: {
	ctx: SlotProcessorContext;
	customerId: string;
	lockId: string;
}): WorkerLock | null => {
	const held = ctx.openLocks.lockOf({ customerId, lockId });
	if (held) return held.row;
	const owed = ctx.journal.owed({ customerId });
	if (!owed.some((entry) => takesLock(entry, lockId))) return null;
	replayLockRows({ ctx, customerId, owed });
	return ctx.openLocks.lockOf({ customerId, lockId })?.row ?? null;
};
