import { splitSubjectState } from "@autumn/balance-engine";
import type { StoredSubject } from "../../../state/types/storedSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

/**
 * Stores a subject as its owners hold it: the customer's own rows, and an entity's own rows beside them.
 * So every push refreshes the customer's rows, and no entity keeps a copy of them that could go stale.
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
	return stored.at(-1) ?? false;
};
